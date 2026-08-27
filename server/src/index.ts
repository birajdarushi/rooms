import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import { roomsRouter } from './routes/rooms';
import { storageRouter } from './routes/storage';
import { youtubeRouter } from './routes/youtube';
import { spotifyRouter } from './routes/spotify';
import { streamRouter } from './routes/stream';
import { playbackRouter } from './routes/playback';
import { syncRouter } from './routes/sync';
import { storageService } from './services/storage';

// Global process armor — prevent crashes from unhandled errors
process.on('uncaughtException', (err: any) => {
  console.error('[Server] uncaughtException (prevented crash):', err?.message || err);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('[Server] unhandledRejection (prevented crash):', reason?.message || reason);
});

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: Date.now(), service: 'WaveRooms Backend' });
});

// REST API routes (dual-path: /api/* and /* for serverless compatibility)
app.use(['/api/rooms', '/rooms'], roomsRouter);
app.use(['/api/storage', '/storage'], storageRouter);
app.use(['/api/youtube', '/youtube'], youtubeRouter);
app.use(['/api/spotify', '/spotify'], spotifyRouter);
app.use(['/api/stream', '/stream'], streamRouter);
app.use(['/api/playback', '/playback'], playbackRouter);
app.use(['/api/sync', '/sync'], syncRouter);

// Global Express error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Express Error]:', err?.message || err);
  if (!res.headersSent) {
    res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

// Only start HTTP server when not running on Vercel (serverless)
if (!process.env.VERCEL) {
  const PORT = config.port;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=============================================`);
    console.log(`WaveRooms Backend running on port ${PORT}`);
    console.log(`Real-time: Ably managed WebSockets`);
    console.log(`Audio: cobalt.tools stream extraction`);
    console.log(`=============================================`);

    storageService.runOrphanedDataCleanupSweep().catch(() => {});
    setInterval(() => storageService.runOrphanedDataCleanupSweep().catch(() => {}), 60 * 60 * 1000);
  });
}

export default app;
