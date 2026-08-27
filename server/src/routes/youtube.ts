import { Router, Request, Response } from 'express';
import { prisma, formatSong, formatQueueItem } from '../db/prisma';
import { youtubeService, isValidYouTubeUrl } from '../services/youtube';
import { publishToRoom } from '../services/ablyPublisher';
import { SocketEvents } from '../shared';

export const youtubeRouter = Router();

/**
 * 1. Fetch YouTube Video Info
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
 * 2. Extract Audio from YouTube and Add to Room Queue
 */
youtubeRouter.post('/queue', async (req: Request, res: Response) => {
  try {
    const { roomId, url, title, artist, uploaderId = 'host' } = req.body;

    if (!roomId) return res.status(400).json({ error: 'Missing roomId.' });
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

    // Extract stream URL via cobalt
    const result = await youtubeService.getStreamUrl({
      roomId,
      url,
      customTitle: title,
      customArtist: artist,
    });

    // Create Song in DB
    const song = await prisma.song.create({
      data: {
        roomId,
        uploaderId,
        storageUrl: result.storageUrl,
        storageKey: result.storageKey,
        title: result.title,
        artist: result.artist,
        duration: result.duration,
        artworkUrl: result.artworkUrl,
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

    // Set as current song if queue was empty
    let isNowCurrentSong = false;
    if (!room.currentSongId) {
      isNowCurrentSong = true;
      await prisma.room.update({
        where: { id: roomId },
        data: { currentSongId: song.id, playbackState: 'idle', offsetSeconds: 0, startedAt: null },
      });
    }

    // Broadcast to all room members via Ably
    const allQueueItems = await prisma.queueItem.findMany({
      where: { roomId },
      include: { song: true },
      orderBy: { position: 'asc' },
    });

    await publishToRoom(room.code, SocketEvents.QUEUE_UPDATED, {
      queue: allQueueItems.map(formatQueueItem),
    });

    if (isNowCurrentSong) {
      await publishToRoom(room.code, SocketEvents.SONG_CHANGED, {
        currentSong: formatSong(song),
        startedAt: null,
        offsetSeconds: 0,
        playbackState: 'idle',
      });
    }

    console.log(`[YouTubeRouter] Queued "${song.title}" in room ${room.code}`);

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
