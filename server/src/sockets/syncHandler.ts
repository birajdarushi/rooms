import { Server, Socket } from 'socket.io';
import { prisma, formatSong, formatQueueItem, formatRoom } from '../db/prisma';
import {
  SocketEvents,
  PingPayload,
  PongPayload,
  PlayPayload,
  PausePayload,
  SeekPayload,
  SongChangedPayload,
} from '../shared';

let ioInstance: Server | null = null;

export function setSocketServer(io: Server) {
  ioInstance = io;
}

export function getSocketServer(): Server | null {
  return ioInstance;
}

export function registerSyncAndPlaybackHandlers(io: Server, socket: Socket) {
  // 1. Clock Synchronization (Ping-Pong)
  socket.on(SocketEvents.PING, (payload: PingPayload) => {
    const pong: PongPayload = {
      clientSentAt: payload.clientSentAt,
      serverTime: Date.now(),
    };
    socket.emit(SocketEvents.PONG, pong);
  });

  // 2. Play Action (Host Only)
  socket.on(SocketEvents.PLAY, async (payload: { songId: string; offsetSeconds?: number }) => {
    try {
      const roomCode = socket.data.roomCode;
      const isHost = socket.data.isHost;

      if (!roomCode || !isHost) {
        console.warn(`[Sync] Unauthorized play command from socket ${socket.id}`);
        return;
      }

      const offsetSeconds = typeof payload.offsetSeconds === 'number' ? Math.max(0, payload.offsetSeconds) : 0;
      const serverTime = Date.now();

      // ⚡ IMMEDIATE BROADCAST: Deliver play command to all clients in 0ms without waiting for DB
      const playBroadcast: PlayPayload = {
        songId: payload.songId,
        offsetSeconds,
        startedAt: serverTime,
      };
      io.to(roomCode).emit(SocketEvents.PLAY, playBroadcast);
      console.log(`[Sync] ⚡ Instant Play broadcast in ${roomCode} for song ${payload.songId} at ${offsetSeconds}s (serverTime: ${serverTime})`);

      // Parallel async DB update
      prisma.room.findUnique({ where: { code: roomCode } }).then(async (oldRoom) => {
        const isNewSong = oldRoom?.currentSongId !== payload.songId;

        await prisma.room.update({
          where: { code: roomCode },
          data: {
            currentSongId: payload.songId,
            playbackState: 'playing',
            startedAt: BigInt(serverTime),
            offsetSeconds,
          },
        });

        if (isNewSong) {
          const song = await prisma.song.findUnique({ where: { id: payload.songId } });
          if (song) {
            io.to(roomCode).emit(SocketEvents.SONG_CHANGED, {
              currentSong: formatSong(song),
              startedAt: serverTime,
              offsetSeconds,
              playbackState: 'playing',
            });
          }
        }
      }).catch((e) => console.error('[Sync] DB update error on play:', e));
    } catch (err) {
      console.error('[Sync] Error handling play event:', err);
    }
  });

  // 3. Pause Action (Host Only)
  socket.on(SocketEvents.PAUSE, async (payload: { offsetSeconds: number }) => {
    try {
      const roomCode = socket.data.roomCode;
      const isHost = socket.data.isHost;

      if (!roomCode || !isHost) return;

      const offsetSeconds = typeof payload.offsetSeconds === 'number' ? Math.max(0, payload.offsetSeconds) : 0;

      // ⚡ IMMEDIATE BROADCAST
      const pauseBroadcast: PausePayload = { offsetSeconds };
      io.to(roomCode).emit(SocketEvents.PAUSE, pauseBroadcast);
      console.log(`[Sync] ⚡ Instant Pause broadcast in ${roomCode} at ${offsetSeconds}s`);

      prisma.room.update({
        where: { code: roomCode },
        data: {
          playbackState: 'paused',
          startedAt: null,
          offsetSeconds,
        },
      }).catch((e) => console.error('[Sync] DB update error on pause:', e));
    } catch (err) {
      console.error('[Sync] Error handling pause event:', err);
    }
  });

  // 4. Seek Action (Host Only)
  socket.on(SocketEvents.SEEK, async (payload: { offsetSeconds: number }) => {
    try {
      const roomCode = socket.data.roomCode;
      const isHost = socket.data.isHost;

      if (!roomCode || !isHost) return;

      const offsetSeconds = typeof payload.offsetSeconds === 'number' ? Math.max(0, payload.offsetSeconds) : 0;
      const serverTime = Date.now();

      const room = await prisma.room.findUnique({ where: { code: roomCode } });
      if (!room) return;

      const isPlaying = room.playbackState === 'playing';
      const startedAt = isPlaying ? serverTime : null;

      // ⚡ IMMEDIATE BROADCAST to all listeners
      const seekBroadcast: SeekPayload = {
        offsetSeconds,
        startedAt,
        playbackState: room.playbackState as any,
      };
      io.to(roomCode).emit(SocketEvents.SEEK, seekBroadcast);
      console.log(`[Sync] ⚡ Instant Seek broadcast in ${roomCode} to ${offsetSeconds}s (playing: ${isPlaying})`);

      prisma.room.update({
        where: { code: roomCode },
        data: {
          offsetSeconds,
          startedAt: startedAt !== null ? BigInt(startedAt) : null,
        },
      }).catch((e) => console.error('[Sync] DB update error on seek:', e));
    } catch (err) {
      console.error('[Sync] Error handling seek event:', err);
    }
  });

  // 5. Skip / Next Track Action (Host Only or Auto-Advance)
  socket.on(SocketEvents.SKIP, async () => {
    try {
      const roomCode = socket.data.roomCode;
      const isHost = socket.data.isHost;
      if (!roomCode || !isHost) return;

      await advanceToNextSong(io, roomCode);
    } catch (err) {
      console.error('[Sync] Error handling skip event:', err);
    }
  });

  // 6. Track Ended Action (Triggered when current track finishes playing)
  socket.on(SocketEvents.TRACK_ENDED, async (payload: { songId: string }) => {
    try {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;

      const room = await prisma.room.findUnique({ where: { code: roomCode } });
      if (!room || room.currentSongId !== payload.songId) return;

      console.log(`[Sync] Track ended in ${roomCode} for song ${payload.songId}. Auto-advancing.`);
      await advanceToNextSong(io, roomCode);
    } catch (err) {
      console.error('[Sync] Error handling track-ended event:', err);
    }
  });

  // 7. Queue Reordering (Host Only)
  socket.on(SocketEvents.REORDER_QUEUE, async (payload: { orderedQueueItemIds: string[] }) => {
    try {
      const roomCode = socket.data.roomCode;
      const isHost = socket.data.isHost;
      if (!roomCode || !isHost || !payload.orderedQueueItemIds) return;

      const room = await prisma.room.findUnique({ where: { code: roomCode } });
      if (!room) return;

      // Update positions sequentially
      for (let i = 0; i < payload.orderedQueueItemIds.length; i++) {
        await prisma.queueItem.update({
          where: { id: payload.orderedQueueItemIds[i] },
          data: { position: i },
        });
      }

      const updatedQueue = await prisma.queueItem.findMany({
        where: { roomId: room.id },
        include: { song: true },
        orderBy: { position: 'asc' },
      });

      io.to(roomCode).emit(SocketEvents.QUEUE_UPDATED, {
        queue: updatedQueue.map(formatQueueItem),
      });
    } catch (err) {
      console.error('[Sync] Error handling reorder queue:', err);
    }
  });

  // 8. Remove from Queue (Host Only)
  socket.on(SocketEvents.REMOVE_FROM_QUEUE, async (payload: { queueItemId: string }) => {
    try {
      const roomCode = socket.data.roomCode;
      const isHost = socket.data.isHost;
      if (!roomCode || !isHost || !payload.queueItemId) return;

      const room = await prisma.room.findUnique({ where: { code: roomCode } });
      if (!room) return;

      await prisma.queueItem.delete({
        where: { id: payload.queueItemId },
      });

      // Renumber remaining items
      const remaining = await prisma.queueItem.findMany({
        where: { roomId: room.id },
        orderBy: { position: 'asc' },
      });

      for (let i = 0; i < remaining.length; i++) {
        await prisma.queueItem.update({
          where: { id: remaining[i].id },
          data: { position: i },
        });
      }

      const updatedQueue = await prisma.queueItem.findMany({
        where: { roomId: room.id },
        include: { song: true },
        orderBy: { position: 'asc' },
      });

      io.to(roomCode).emit(SocketEvents.QUEUE_UPDATED, {
        queue: updatedQueue.map(formatQueueItem),
      });
    } catch (err) {
      console.error('[Sync] Error removing item from queue:', err);
    }
  });
}

export async function advanceToNextSong(io: Server, roomCode: string) {
  const room = await prisma.room.findUnique({
    where: { code: roomCode },
    include: {
      queueItems: {
        include: { song: true },
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!room || room.status === 'ended') return;

  const currentIdx = room.queueItems.findIndex((item) => item.songId === room.currentSongId);
  const nextItem = currentIdx !== -1 && currentIdx + 1 < room.queueItems.length
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

    const changePayload: SongChangedPayload = {
      currentSong: formatSong(nextItem.song),
      startedAt: serverTime,
      offsetSeconds: 0,
      playbackState: 'playing',
    };

    console.log(`[Sync] Advanced to next song in ${roomCode}: "${nextItem.song.title}"`);
    io.to(roomCode).emit(SocketEvents.SONG_CHANGED, changePayload);
  } else {
    // End of queue reached
    await prisma.room.update({
      where: { id: room.id },
      data: {
        currentSongId: null,
        playbackState: 'idle',
        startedAt: null,
        offsetSeconds: 0,
      },
    });

    const changePayload: SongChangedPayload = {
      currentSong: null,
      startedAt: null,
      offsetSeconds: 0,
      playbackState: 'idle',
    };

    console.log(`[Sync] Reached end of queue in ${roomCode}. Set to idle.`);
    io.to(roomCode).emit(SocketEvents.SONG_CHANGED, changePayload);
  }
}
