/**
 * Playback control REST routes — replaces Socket.io PLAY/PAUSE/SEEK/SKIP/TRACK_ENDED events.
 * Host calls these endpoints; server updates DB and broadcasts via Ably to all listeners.
 */
import { Router, Request, Response } from 'express';
import { prisma, formatSong, formatQueueItem } from '../db/prisma';
import { publishToRoom } from '../services/ablyPublisher';
import { SocketEvents, SongChangedPayload } from '../shared';

export const playbackRouter = Router();

// POST /api/playback/play
playbackRouter.post('/play', async (req: Request, res: Response) => {
  try {
    const { roomCode, songId, offsetSeconds = 0, userId } = req.body;
    if (!roomCode || !songId) return res.status(400).json({ error: 'roomCode and songId required' });

    const serverTime = Date.now();

    const room = await prisma.room.findUnique({ where: { code: roomCode.toUpperCase() } });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const isNewSong = room.currentSongId !== songId;

    await prisma.room.update({
      where: { code: roomCode.toUpperCase() },
      data: {
        currentSongId: songId,
        playbackState: 'playing',
        startedAt: BigInt(serverTime),
        offsetSeconds: Math.max(0, offsetSeconds),
      },
    });

    await publishToRoom(roomCode, SocketEvents.PLAY, {
      songId,
      offsetSeconds: Math.max(0, offsetSeconds),
      startedAt: serverTime,
    });

    if (isNewSong) {
      const song = await prisma.song.findUnique({ where: { id: songId } });
      if (song) {
        await publishToRoom(roomCode, SocketEvents.SONG_CHANGED, {
          currentSong: formatSong(song),
          startedAt: serverTime,
          offsetSeconds: Math.max(0, offsetSeconds),
          playbackState: 'playing',
        });
      }
    }

    return res.json({ ok: true, serverTime });
  } catch (err: any) {
    console.error('[Playback] /play error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/playback/pause
playbackRouter.post('/pause', async (req: Request, res: Response) => {
  try {
    const { roomCode, offsetSeconds = 0 } = req.body;
    if (!roomCode) return res.status(400).json({ error: 'roomCode required' });

    await prisma.room.update({
      where: { code: roomCode.toUpperCase() },
      data: { playbackState: 'paused', startedAt: null, offsetSeconds: Math.max(0, offsetSeconds) },
    });

    await publishToRoom(roomCode, SocketEvents.PAUSE, { offsetSeconds: Math.max(0, offsetSeconds) });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[Playback] /pause error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/playback/seek
playbackRouter.post('/seek', async (req: Request, res: Response) => {
  try {
    const { roomCode, offsetSeconds = 0 } = req.body;
    if (!roomCode) return res.status(400).json({ error: 'roomCode required' });

    const serverTime = Date.now();
    const room = await prisma.room.findUnique({ where: { code: roomCode.toUpperCase() } });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const isPlaying = room.playbackState === 'playing';
    const newStartedAt = isPlaying ? serverTime : null;

    await prisma.room.update({
      where: { code: roomCode.toUpperCase() },
      data: {
        offsetSeconds: Math.max(0, offsetSeconds),
        startedAt: newStartedAt !== null ? BigInt(newStartedAt) : null,
      },
    });

    await publishToRoom(roomCode, SocketEvents.SEEK, {
      offsetSeconds: Math.max(0, offsetSeconds),
      startedAt: newStartedAt,
      playbackState: room.playbackState,
    });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[Playback] /seek error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/playback/skip
playbackRouter.post('/skip', async (req: Request, res: Response) => {
  try {
    const { roomCode } = req.body;
    if (!roomCode) return res.status(400).json({ error: 'roomCode required' });

    await advanceToNextSong(roomCode.toUpperCase());
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[Playback] /skip error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/playback/track-ended (called by client when track finishes naturally)
playbackRouter.post('/track-ended', async (req: Request, res: Response) => {
  try {
    const { roomCode, songId } = req.body;
    if (!roomCode || !songId) return res.status(400).json({ error: 'roomCode and songId required' });

    const room = await prisma.room.findUnique({ where: { code: roomCode.toUpperCase() } });
    if (!room || room.currentSongId !== songId) {
      // Song already changed — ignore stale event
      return res.json({ ok: true, skipped: true });
    }

    await advanceToNextSong(roomCode.toUpperCase());
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[Playback] /track-ended error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/playback/reorder — Reorder queue items
playbackRouter.post('/reorder', async (req: Request, res: Response) => {
  try {
    const { roomCode, orderedQueueItemIds } = req.body;
    if (!roomCode || !Array.isArray(orderedQueueItemIds)) {
      return res.status(400).json({ error: 'roomCode and orderedQueueItemIds required' });
    }

    const room = await prisma.room.findUnique({ where: { code: roomCode.toUpperCase() } });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    for (let i = 0; i < orderedQueueItemIds.length; i++) {
      await prisma.queueItem.update({
        where: { id: orderedQueueItemIds[i] },
        data: { position: i },
      });
    }

    const updatedQueue = await prisma.queueItem.findMany({
      where: { roomId: room.id },
      include: { song: true },
      orderBy: { position: 'asc' },
    });

    await publishToRoom(roomCode, SocketEvents.QUEUE_UPDATED, {
      queue: updatedQueue.map(formatQueueItem),
    });

    return res.json({ ok: true, queue: updatedQueue.map(formatQueueItem) });
  } catch (err: any) {
    console.error('[Playback] /reorder error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/playback/remove — Remove a queue item
playbackRouter.post('/remove', async (req: Request, res: Response) => {
  try {
    const { roomCode, queueItemId } = req.body;
    if (!roomCode || !queueItemId) return res.status(400).json({ error: 'roomCode and queueItemId required' });

    const room = await prisma.room.findUnique({ where: { code: roomCode.toUpperCase() } });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    await prisma.queueItem.delete({ where: { id: queueItemId } });

    const remaining = await prisma.queueItem.findMany({
      where: { roomId: room.id },
      orderBy: { position: 'asc' },
    });

    for (let i = 0; i < remaining.length; i++) {
      await prisma.queueItem.update({ where: { id: remaining[i].id }, data: { position: i } });
    }

    const updatedQueue = await prisma.queueItem.findMany({
      where: { roomId: room.id },
      include: { song: true },
      orderBy: { position: 'asc' },
    });

    await publishToRoom(roomCode, SocketEvents.QUEUE_UPDATED, {
      queue: updatedQueue.map(formatQueueItem),
    });

    return res.json({ ok: true, queue: updatedQueue.map(formatQueueItem) });
  } catch (err: any) {
    console.error('[Playback] /remove error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/playback/end-room — Host ends the room
playbackRouter.post('/end-room', async (req: Request, res: Response) => {
  try {
    const { roomCode } = req.body;
    if (!roomCode) return res.status(400).json({ error: 'roomCode required' });

    const room = await prisma.room.findUnique({ where: { code: roomCode.toUpperCase() } });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    await prisma.room.update({
      where: { id: room.id },
      data: { status: 'ended', playbackState: 'idle' },
    });

    await publishToRoom(roomCode, SocketEvents.ROOM_ENDED, { reason: 'host_ended' });

    console.log(`[Playback] Room ${roomCode} ended by host`);
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[Playback] /end-room error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

async function advanceToNextSong(roomCode: string) {
  const room = await prisma.room.findUnique({
    where: { code: roomCode },
    include: {
      queueItems: { include: { song: true }, orderBy: { position: 'asc' } },
    },
  });

  if (!room || room.status === 'ended') return;

  const currentIdx = room.queueItems.findIndex((item) => item.songId === room.currentSongId);
  const nextItem =
    currentIdx !== -1 && currentIdx + 1 < room.queueItems.length
      ? room.queueItems[currentIdx + 1]
      : null;

  if (nextItem) {
    const serverTime = Date.now();
    await prisma.room.update({
      where: { id: room.id },
      data: {
        currentSongId: nextItem.song.id,
        playbackState: 'playing',
        startedAt: BigInt(serverTime),
        offsetSeconds: 0,
      },
    });

    const payload: SongChangedPayload = {
      currentSong: formatSong(nextItem.song),
      startedAt: serverTime,
      offsetSeconds: 0,
      playbackState: 'playing',
    };

    await publishToRoom(roomCode, SocketEvents.SONG_CHANGED, payload);
    console.log(`[Playback] Advanced to "${nextItem.song.title}" in room ${roomCode}`);
  } else {
    await prisma.room.update({
      where: { id: room.id },
      data: { currentSongId: null, playbackState: 'idle', startedAt: null, offsetSeconds: 0 },
    });

    await publishToRoom(roomCode, SocketEvents.SONG_CHANGED, {
      currentSong: null,
      startedAt: null,
      offsetSeconds: 0,
      playbackState: 'idle',
    });
    console.log(`[Playback] End of queue in room ${roomCode}`);
  }
}
