import { Router, Request, Response } from 'express';
import express from 'express';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { prisma, formatSong, formatQueueItem } from '../db/prisma';
import { storageService } from '../services/storage';
import { config } from '../config/env';
import { getSocketServer } from '../sockets/syncHandler';
import { SocketEvents } from '../shared';

/**
 * Returns the base URL the server should use when building presigned upload
 * and public audio URLs that need to be reachable from mobile devices.
 */
function getServerBaseUrl(req: Request): string {
  // 0. If request arrived through an HTTPS proxy / Cloudflare Tunnel / custom domain
  const proto = (req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : 'http');
  const forwardedHost = (req.headers['x-forwarded-host'] as string) || req.get('host');
  
  if (proto === 'https' && forwardedHost) {
    return `https://${forwardedHost}`;
  }
  if (forwardedHost && (forwardedHost.includes('trycloudflare.com') || forwardedHost.includes('birajdar.in') || forwardedHost.includes('pages.dev') || forwardedHost.includes('vercel.app'))) {
    return `https://${forwardedHost}`;
  }

  // 1. Explicit override via HOST_IP env var
  if (process.env.HOST_IP) {
    return `http://${process.env.HOST_IP}:${config.port}`;
  }

  // 2. Prefer known WiFi interface names (en0 on Mac, wlan0/eth0 on Linux)
  const ifaces = os.networkInterfaces();
  const preferred = ['en0', 'wlan0', 'eth0', 'Wi-Fi'];
  for (const name of preferred) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return `http://${iface.address}:${config.port}`;
      }
    }
  }

  // 3. Any non-internal IPv4 that isn't a 172.x (VPN/Docker) range
  for (const ifaceList of Object.values(ifaces)) {
    for (const iface of ifaceList || []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('172.')) {
        return `http://${iface.address}:${config.port}`;
      }
    }
  }

  // 4. Last resort: use the request host header
  const host = req.get('host') || `localhost:${config.port}`;
  return `http://${host}`;
}

export const storageRouter = Router();

const handlePresignedUrl = async (req: Request, res: Response) => {
  try {
    const roomId = req.params.id || req.body.roomId;
    const { filename = 'audio.mp3', contentType = req.body.mimeType || 'audio/mpeg' } = req.body;

    if (!roomId) {
      return res.status(400).json({ error: 'Missing roomId' });
    }

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.status === 'ended') {
      return res.status(404).json({ error: 'Room not found or ended' });
    }

    const baseUrl = getServerBaseUrl(req);
    console.log(`[Storage] Generating presigned URL with base: ${baseUrl}`);

    const presignedData = await storageService.getPresignedUploadUrl(
      roomId,
      filename,
      contentType,
      baseUrl
    );

    return res.json(presignedData);
  } catch (error) {
    console.error('Error generating presigned upload url:', error);
    return res.status(500).json({ error: 'Failed to generate upload URL' });
  }
};

// Support all URL variants: /upload-url, /presigned-url, /rooms/:id/presigned-url, /rooms/:id/upload-url
storageRouter.post('/upload-url', handlePresignedUrl);
storageRouter.post('/presigned-url', handlePresignedUrl);
storageRouter.post('/rooms/:id/presigned-url', handlePresignedUrl);
storageRouter.post('/rooms/:id/upload-url', handlePresignedUrl);

// Local dev direct upload handler (accepts raw binary body or stream)
storageRouter.put(
  '/local-upload',
  express.raw({ limit: '150mb', type: () => true }),
  (req: Request, res: Response) => {
    const key = req.query.key as string;
    if (!key) {
      return res.status(400).json({ error: 'Missing storage key' });
    }

    try {
      const filePath = path.join(config.storage.localUploadDir, key);
      const dirPath = path.dirname(filePath);

      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      if (Buffer.isBuffer(req.body)) {
        fs.writeFileSync(filePath, req.body);
        console.log(`[Storage] Saved uploaded file to disk (${req.body.length} bytes): ${filePath}`);
        return res.status(200).json({ success: true, key, size: req.body.length });
      } else {
        const writeStream = fs.createWriteStream(filePath);
        req.pipe(writeStream);

        writeStream.on('finish', () => {
          console.log(`[Storage] Streamed upload saved to disk: ${filePath}`);
          return res.status(200).json({ success: true, key });
        });

        writeStream.on('error', (err) => {
          console.error('[Storage] Error saving local uploaded file:', err);
          return res.status(500).json({ error: 'Failed to write file' });
        });
      }
    } catch (err) {
      console.error('[Storage] Unexpected error during local upload:', err);
      return res.status(500).json({ error: 'Upload processing failed' });
    }
  }
);

const handleAddSong = async (req: Request, res: Response) => {
  try {
    const roomId = req.params.id || req.body.roomId;
    const { storageUrl, storageKey, title, artist = 'Unknown Artist', duration = 0, uploaderId = 'host' } = req.body;

    if (!roomId) {
      return res.status(400).json({ error: 'Missing roomId' });
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { queueItems: true },
    });

    if (!room || room.status === 'ended') {
      return res.status(404).json({ error: 'Room not found or ended' });
    }

    const song = await prisma.song.create({
      data: {
        roomId,
        uploaderId,
        storageUrl,
        storageKey,
        title: title || 'Untitled Track',
        artist: artist || 'Unknown Artist',
        duration: Number(duration) || 0,
      },
    });

    const nextPosition = room.queueItems.length;
    const queueItem = await prisma.queueItem.create({
      data: {
        roomId,
        songId: song.id,
        position: nextPosition,
        addedBy: uploaderId,
      },
      include: { song: true },
    });

    // If room has no current song, make this the active song
    if (!room.currentSongId) {
      await prisma.room.update({
        where: { id: roomId },
        data: {
          currentSongId: song.id,
          playbackState: 'idle',
          offsetSeconds: 0,
          startedAt: null,
        },
      });
    }

    // Broadcast updated queue to all room members
    const io = getSocketServer();
    if (io) {
      const allQueueItems = await prisma.queueItem.findMany({
        where: { roomId },
        include: { song: true },
        orderBy: { position: 'asc' },
      });

      io.to(room.code).emit(SocketEvents.QUEUE_UPDATED, {
        queue: allQueueItems.map(formatQueueItem),
      });

      if (!room.currentSongId) {
        io.to(room.code).emit(SocketEvents.SONG_CHANGED, {
          currentSong: formatSong(song),
          startedAt: null,
          offsetSeconds: 0,
          playbackState: 'idle',
        });
      }
    }

    console.log(`[Storage] Registered song "${song.title}" (${song.id}) to room ${room.code}`);

    return res.status(201).json({
      song: formatSong(song),
      queueItem: formatQueueItem(queueItem),
    });
  } catch (error) {
    console.error('Error adding song to room:', error);
    return res.status(500).json({ error: 'Failed to add song' });
  }
};

// Support /register-song, /add-song, and /rooms/:id/songs
storageRouter.post('/register-song', handleAddSong);
storageRouter.post('/add-song', handleAddSong);
storageRouter.post('/rooms/:id/songs', handleAddSong);

// GET /rooms/:id/songs and GET /songs (List all uploaded songs for room)
storageRouter.get(['/rooms/:id/songs', '/songs'], async (req: Request, res: Response) => {
  try {
    const roomId = req.params.id || (req.query.roomId as string);
    if (!roomId) {
      return res.status(400).json({ error: 'Missing roomId' });
    }
    const songs = await prisma.song.findMany({
      where: { roomId },
      orderBy: { uploadedAt: 'asc' },
    });
    return res.json({ songs: songs.map(formatSong) });
  } catch (error) {
    console.error('Error fetching songs for room:', error);
    return res.status(500).json({ error: 'Failed to fetch songs' });
  }
});

// DELETE /rooms/:id/songs/:songId
storageRouter.delete('/rooms/:id/songs/:songId', async (req: Request, res: Response) => {
  try {
    const { id, songId } = req.params;
    await prisma.queueItem.deleteMany({
      where: { roomId: id, songId },
    });
    await prisma.song.deleteMany({
      where: { id: songId, roomId: id },
    });
    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting song:', error);
    return res.status(500).json({ error: 'Failed to delete song' });
  }
});
