import { Router, Request, Response } from 'express';
import os from 'os';
import { prisma, formatSong, formatQueueItem } from '../db/prisma';
import { youtubeService, isValidYouTubeUrl } from '../services/youtube';
import { config } from '../config/env';
import { getSocketServer } from '../sockets/syncHandler';
import { SocketEvents } from '../../../shared';

function getServerBaseUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : 'http');
  const forwardedHost = (req.headers['x-forwarded-host'] as string) || req.get('host');

  if (proto === 'https' && forwardedHost) {
    return `https://${forwardedHost}`;
  }
  if (forwardedHost && (forwardedHost.includes('trycloudflare.com') || forwardedHost.includes('birajdar.in') || forwardedHost.includes('pages.dev') || forwardedHost.includes('vercel.app'))) {
    return `https://${forwardedHost}`;
  }

  if (process.env.HOST_IP) {
    return `http://${process.env.HOST_IP}:${config.port}`;
  }

  const ifaces = os.networkInterfaces();
  const preferred = ['en0', 'wlan0', 'eth0', 'Wi-Fi'];
  for (const name of preferred) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return `http://${iface.address}:${config.port}`;
      }
    }
  }

  for (const ifaceList of Object.values(ifaces)) {
    for (const iface of ifaceList || []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('172.')) {
        return `http://${iface.address}:${config.port}`;
      }
    }
  }

  const host = req.get('host') || `localhost:${config.port}`;
  return `http://${host}`;
}

export const youtubeRouter = Router();

/**
 * 1. Fetch YouTube Video Info (Title, Artist, Duration, Thumbnail) for UI preview
 */
youtubeRouter.post('/info', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string' || !isValidYouTubeUrl(url)) {
      return res.status(400).json({ error: 'Valid YouTube URL is required.' });
    }

    const info = await youtubeService.getVideoInfo(url);
    return res.status(200).json({ info });
  } catch (err: any) {
    console.error('[YouTubeRouter] Error in /info:', err.message || err);
    return res.status(500).json({ error: err.message || 'Failed to fetch YouTube metadata' });
  }
});

/**
 * 2. Download/Extract Audio from YouTube and Add to Room Queue
 */
youtubeRouter.post('/queue', async (req: Request, res: Response) => {
  try {
    const { roomId, url, title, artist, uploaderId = 'host' } = req.body;

    if (!roomId) {
      return res.status(400).json({ error: 'Missing roomId.' });
    }
    if (!url || typeof url !== 'string' || !isValidYouTubeUrl(url)) {
      return res.status(400).json({ error: 'Valid YouTube URL is required.' });
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { queueItems: true },
    });

    if (!room || room.status === 'ended') {
      return res.status(404).json({ error: 'Room not found or has ended.' });
    }

    const baseUrl = getServerBaseUrl(req);

    // Extract audio
    const result = await youtubeService.downloadAudioTrack({
      roomId,
      url,
      uploadsDir: config.storage.localUploadDir,
      customTitle: title,
      customArtist: artist,
    });

    const fullStorageUrl = result.storageUrl.startsWith('http')
      ? result.storageUrl
      : `${baseUrl}${result.storageUrl}`;

    // Create Song in DB
    const song = await prisma.song.create({
      data: {
        roomId,
        uploaderId,
        storageUrl: fullStorageUrl,
        storageKey: result.storageKey,
        title: result.title,
        artist: result.artist,
        duration: result.duration,
      },
    });

    // Append to Queue
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

    // If room currently has no track playing, make this the active song
    let isNowCurrentSong = false;
    if (!room.currentSongId) {
      isNowCurrentSong = true;
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

      if (isNowCurrentSong) {
        io.to(room.code).emit(SocketEvents.SONG_CHANGED, {
          currentSong: formatSong(song),
          startedAt: null,
          offsetSeconds: 0,
          playbackState: 'idle',
        });
      }
    }

    console.log(`[YouTubeRouter] 🎵 Queued YouTube track "${song.title}" (${song.id}) in room ${room.code}`);

    return res.status(201).json({
      song: formatSong(song),
      queueItem: formatQueueItem(queueItem),
      preview: result,
    });
  } catch (err: any) {
    console.error('[YouTubeRouter] Error in /queue:', err.message || err);
    return res.status(500).json({ error: err.message || 'Failed to queue YouTube track' });
  }
});
