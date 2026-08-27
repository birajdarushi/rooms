import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { config } from './config/env';
import { roomsRouter } from './routes/rooms';
import { storageRouter } from './routes/storage';
import { youtubeRouter } from './routes/youtube';
import { spotifyRouter } from './routes/spotify';
import { streamRouter } from './routes/stream';
import { registerRoomLifecycle } from './sockets/roomLifecycle';
import { registerSyncAndPlaybackHandlers, setSocketServer } from './sockets/syncHandler';
import { registerStreamHandlers } from './sockets/streamHandler';
import { storageService } from './services/storage';
import { prisma } from './db/prisma';

// 🛡️ GLOBAL PROCESS ARMOR: Prevent Node server from ever dying or crashing from unhandled errors
process.on('uncaughtException', (err: any) => {
  console.error('🛡️ [Server Armor] Intercepted uncaughtException (prevented server crash):', err?.message || err);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('🛡️ [Server Armor] Intercepted unhandledRejection (prevented server crash):', reason?.message || reason);
});

const app = express();
const server = http.createServer(app);

// Enable CORS for all local, production, and mobile network clients
app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve local upload files with audio and video headers for streaming
app.use(
  '/uploads',
  express.static(config.storage.localUploadDir, {
    setHeaders: (res, filePath) => {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (filePath.endsWith('.mp3')) res.setHeader('Content-Type', 'audio/mpeg');
      else if (filePath.endsWith('.m4a')) res.setHeader('Content-Type', 'audio/mp4');
      else if (filePath.endsWith('.mp4')) res.setHeader('Content-Type', 'video/mp4');
      else if (filePath.endsWith('.wav')) res.setHeader('Content-Type', 'audio/wav');
      else if (filePath.endsWith('.flac')) res.setHeader('Content-Type', 'audio/flac');
    },
  })
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: Date.now(), service: 'Room Synced Backend' });
});

// REST API routes
app.use('/api/rooms', roomsRouter);
app.use('/api/storage', storageRouter);
app.use('/api/youtube', youtubeRouter);
app.use('/api/spotify', spotifyRouter);
app.use('/api/stream', streamRouter);

// Global Express error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('🛡️ [Express Error Handler]:', err?.message || err);
  if (!res.headersSent) {
    res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

// Initialize Socket.io Server
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

setSocketServer(io);

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Register handlers safely
  try {
    registerRoomLifecycle(io, socket);
    registerSyncAndPlaybackHandlers(io, socket);
    registerStreamHandlers(io, socket);
  } catch (err) {
    console.error('[Socket] Error attaching handlers:', err);
  }
});

// Fast clean shutdown handlers to prevent EADDRINUSE during hot reloads
const cleanShutdown = async (signal: string) => {
  console.log(`[Server] ${signal} received: closing connections`);
  try {
    io.close();
    server.closeAllConnections?.();
    server.close(() => {
      console.log('[Server] HTTP and Socket server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 800);
  } catch (_) {
    process.exit(0);
  }
};

process.on('SIGTERM', () => cleanShutdown('SIGTERM'));
process.on('SIGINT', () => cleanShutdown('SIGINT'));

if (!process.env.VERCEL) {
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`=============================================`);
    console.log(`🎵 Room Backend running on port ${config.port}`);
    console.log(`📡 Local server: http://localhost:${config.port}`);
    console.log(`💾 Storage Provider: ${config.storage.provider}`);
    console.log(`=============================================`);

    // Run startup janitor sweep to delete orphaned audio from prior server runs
    storageService.runOrphanedDataCleanupSweep().catch(() => {});

    // Run hourly background sweep
    setInterval(() => {
      storageService.runOrphanedDataCleanupSweep().catch(() => {});
    }, 60 * 60 * 1000);
  });
}

export default app;
export { app, server, io };
