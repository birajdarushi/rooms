import { Server, Socket } from 'socket.io';
import { prisma, formatSong, formatQueueItem } from '../db/prisma';
import { storageService } from '../services/storage';
import { getActiveLiveStream } from './streamHandler';
import { SocketEvents, HostStatusPayload, RoomEndedPayload } from '../shared';

interface RoomSessionState {
  roomId: string;
  roomCode: string;
  hostId: string;
  hostSocketId: string | null;
  hostDisconnectTimer: NodeJS.Timeout | null;
  gracePeriodEndsAt: number | null;
  syncPulseTimer: NodeJS.Timeout | null;
  connectedMembers: Map<string, { socketId: string; displayName: string; isHost: boolean }>;
}

const activeRooms = new Map<string, RoomSessionState>();

export function getActiveRoom(roomCode: string) {
  return activeRooms.get(roomCode.toUpperCase());
}

export function getActiveRoomById(roomId: string) {
  for (const session of activeRooms.values()) {
    if (session.roomId === roomId) return session;
  }
  return undefined;
}

export function registerRoomLifecycle(io: Server, socket: Socket) {
  // Join Room Event
  socket.on(
    SocketEvents.JOIN_ROOM,
    async (payload: { roomCode: string; userId: string; displayName: string; isHost?: boolean }) => {
      try {
        const { roomCode, userId, displayName, isHost = false } = payload;
        const normalizedCode = roomCode.trim().toUpperCase();

        const room = await prisma.room.findUnique({
          where: { code: normalizedCode },
          include: {
            songs: true,
            queueItems: {
              include: { song: true },
              orderBy: { position: 'asc' },
            },
          },
        });

        if (!room || room.status === 'ended') {
          socket.emit(SocketEvents.ROOM_ENDED, { reason: 'host_ended' });
          return;
        }

        socket.join(normalizedCode);

        // Store session metadata on socket
        socket.data.roomId = room.id;
        socket.data.roomCode = normalizedCode;
        socket.data.userId = userId;
        socket.data.displayName = displayName;
        socket.data.isHost = isHost || room.hostId === userId;

        let session = activeRooms.get(normalizedCode);
        if (!session) {
          session = {
            roomId: room.id,
            roomCode: normalizedCode,
            hostId: room.hostId,
            hostSocketId: null,
            hostDisconnectTimer: null,
            gracePeriodEndsAt: null,
            syncPulseTimer: null,
            connectedMembers: new Map(),
          };
          activeRooms.set(normalizedCode, session);
        }

        session.connectedMembers.set(userId, {
          socketId: socket.id,
          displayName,
          isHost: socket.data.isHost,
        });

        // If host joined / reconnected
        if (socket.data.isHost) {
          session.hostSocketId = socket.id;

          if (session.hostDisconnectTimer) {
            console.log(`[Lifecycle] Host reconnected to room ${normalizedCode} before grace expired!`);
            clearTimeout(session.hostDisconnectTimer);
            session.hostDisconnectTimer = null;
            session.gracePeriodEndsAt = null;

            await prisma.room.update({
              where: { id: room.id },
              data: { status: 'active' },
            });

            const hostStatus: HostStatusPayload = { isHostConnected: true };
            io.to(normalizedCode).emit(SocketEvents.HOST_STATUS, hostStatus);
          }
        }

        // Start periodic sync pulse if not running (every 2.5s for sub-30ms drift lock)
        if (!session.syncPulseTimer) {
          session.syncPulseTimer = setInterval(async () => {
            await emitSyncPulse(io, normalizedCode);
          }, 2500);
        }

        // Emit current member count to everyone
        io.to(normalizedCode).emit(SocketEvents.MEMBER_COUNT, {
          count: session.connectedMembers.size,
        });

        // ---- Send full room state ONLY to the joining socket ----
        // This ensures late-joiners and page-refreshers always see the current queue
        const currentSong = room.currentSongId
          ? room.songs.find((s) => s.id === room.currentSongId) || null
          : null;

        socket.emit(SocketEvents.ROOM_STATE_SYNC, {
          queue: room.queueItems.map(formatQueueItem),
          currentSong: currentSong ? formatSong(currentSong) : null,
          playbackState: room.playbackState,
          startedAt: room.startedAt ? Number(room.startedAt) : null,
          offsetSeconds: room.offsetSeconds,
        });

        // If an active live stream is already running in this room, notify late joiner
        const activeStream = getActiveLiveStream(room.id) || getActiveLiveStream(normalizedCode);
        if (activeStream) {
          socket.emit(SocketEvents.STREAM_STARTED, {
            roomId: activeStream.roomId,
            roomCode: activeStream.roomCode,
            broadcasterSocketId: activeStream.broadcasterSocketId,
            title: activeStream.title,
            startedAt: activeStream.startedAt,
          });
        }

        console.log(
          `[Lifecycle] User ${displayName} (${userId}) joined room ${normalizedCode}. Members: ${session.connectedMembers.size}. Sent state sync (queue: ${room.queueItems.length} songs).`
        );
      } catch (err) {
        console.error('[Lifecycle] Error in join-room handler:', err);
      }
    }
  );

  // Leave Room / Explicit End
  socket.on(SocketEvents.LEAVE_ROOM, async (payload: { endRoom?: boolean }) => {
    await handleSocketDisconnectOrLeave(io, socket, payload?.endRoom || false);
  });

  // Socket Disconnect
  socket.on('disconnect', async () => {
    await handleSocketDisconnectOrLeave(io, socket, false);
  });
}

async function handleSocketDisconnectOrLeave(io: Server, socket: Socket, explicitEnd: boolean) {
  const roomCode = socket.data.roomCode;
  const userId = socket.data.userId;
  const isHost = socket.data.isHost;

  if (!roomCode || !userId) return;

  const session = activeRooms.get(roomCode);
  if (!session) return;

  session.connectedMembers.delete(userId);
  io.to(roomCode).emit(SocketEvents.MEMBER_COUNT, {
    count: session.connectedMembers.size,
  });

  if (isHost && session.hostSocketId === socket.id) {
    session.hostSocketId = null;

    if (explicitEnd) {
      console.log(`[Lifecycle] Host explicitly ended room ${roomCode}`);
      await teardownRoom(io, session, 'host_ended');
    } else {
      // Initiate 25s Grace Period for accidental host disconnect
      console.log(`[Lifecycle] Host disconnected from room ${roomCode}. Starting 25s grace period.`);
      const graceDurationMs = 25000;
      session.gracePeriodEndsAt = Date.now() + graceDurationMs;

      try {
        await prisma.room.update({
          where: { id: session.roomId },
          data: { status: 'grace_period' },
        });
      } catch (e) {
        console.warn(`[Lifecycle] Room update ignored for missing room: ${session.roomId}`);
      }

      const hostStatus: HostStatusPayload = {
        isHostConnected: false,
        gracePeriodSeconds: 25,
        gracePeriodEndsAt: session.gracePeriodEndsAt,
      };
      io.to(roomCode).emit(SocketEvents.HOST_STATUS, hostStatus);

      session.hostDisconnectTimer = setTimeout(async () => {
        console.log(`[Lifecycle] Host grace period expired for room ${roomCode}. Tearing down room.`);
        await teardownRoom(io, session, 'grace_expired');
      }, graceDurationMs);
    }
  }
}

export async function teardownRoom(
  io: Server,
  session: RoomSessionState,
  reason: 'host_left' | 'host_ended' | 'grace_expired'
) {
  const { roomId, roomCode } = session;

  if (session.syncPulseTimer) {
    clearInterval(session.syncPulseTimer);
    session.syncPulseTimer = null;
  }
  if (session.hostDisconnectTimer) {
    clearTimeout(session.hostDisconnectTimer);
    session.hostDisconnectTimer = null;
  }

  // 1. Broadcast room ended to all clients
  const payload: RoomEndedPayload = { reason };
  io.to(roomCode).emit(SocketEvents.ROOM_ENDED, payload);

  // 2. Mark room ended in DB
  try {
    await prisma.room.update({
      where: { id: roomId },
      data: { status: 'ended', playbackState: 'idle' },
    });
  } catch (e) {
    console.error(`[Lifecycle] Error updating room status to ended:`, e);
  }

  // 3. Purge storage files for this ephemeral room
  try {
    await storageService.deleteRoomAudioFiles(roomId);
  } catch (e) {
    console.error(`[Lifecycle] Error purging storage for room ${roomId}:`, e);
  }

  // 4. Remove active session
  activeRooms.delete(roomCode);
  console.log(`[Lifecycle] Room ${roomCode} (${roomId}) fully destroyed.`);
}

async function emitSyncPulse(io: Server, roomCode: string) {
  try {
    const room = await prisma.room.findUnique({ where: { code: roomCode } });
    if (!room || room.status === 'ended') return;

    io.to(roomCode).emit(SocketEvents.SYNC_PULSE, {
      serverTime: Date.now(),
      playbackState: room.playbackState,
      startedAt: room.startedAt !== null ? Number(room.startedAt) : null,
      offsetSeconds: room.offsetSeconds,
      currentSongId: room.currentSongId,
    });
  } catch (err) {
    console.error(`[SyncPulse] Error emitting pulse for room ${roomCode}:`, err);
  }
}
