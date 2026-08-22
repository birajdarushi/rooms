import { Server as SocketIOServer, Socket } from 'socket.io';
import { SocketEvents, StreamStartPayload, StreamOfferPayload, StreamAnswerPayload, StreamIceCandidatePayload, StreamChunkPayload } from '../../../shared';
import { prisma } from '../db/prisma';

interface ActiveLiveStream {
  roomId: string;
  roomCode: string;
  broadcasterSocketId: string;
  title: string;
  startedAt: number;
}

const activeLiveStreams = new Map<string, ActiveLiveStream>();

export function getActiveLiveStream(roomId: string): ActiveLiveStream | undefined {
  return activeLiveStreams.get(roomId);
}

export function registerStreamHandlers(io: SocketIOServer, socket: Socket) {
  /**
   * 1. Host Starts Live System Audio Broadcast
   */
  socket.on(SocketEvents.STREAM_START, async (payload: StreamStartPayload) => {
    try {
      const { roomId, title = 'Live System Audio' } = payload;
      const room = await prisma.room.findUnique({ where: { id: roomId } });

      if (!room || room.status === 'ended') {
        socket.emit('error', { message: 'Room not found or ended.' });
        return;
      }

      const streamInfo: ActiveLiveStream = {
        roomId,
        roomCode: room.code,
        broadcasterSocketId: socket.id,
        title,
        startedAt: Date.now(),
      };

      activeLiveStreams.set(roomId, streamInfo);

      console.log(`[StreamHandler] 🎙️ Live Audio Broadcast started in room ${room.code} by socket ${socket.id}`);

      // Broadcast to all room members that live stream is active
      io.to(room.code).emit(SocketEvents.STREAM_STARTED, {
        roomId,
        broadcasterSocketId: socket.id,
        title,
        startedAt: streamInfo.startedAt,
      });
    } catch (err: any) {
      console.error('[StreamHandler] Error starting stream:', err);
    }
  });

  /**
   * 2. Host Sends WebRTC SDP Offer to a specific listener
   */
  socket.on(SocketEvents.STREAM_OFFER, (payload: StreamOfferPayload) => {
    const { targetSocketId, sdp, roomId } = payload;
    if (targetSocketId && sdp) {
      io.to(targetSocketId).emit(SocketEvents.STREAM_OFFER, {
        roomId,
        broadcasterSocketId: socket.id,
        sdp,
      });
    }
  });

  /**
   * 3. Listener Sends WebRTC SDP Answer back to Host
   */
  socket.on(SocketEvents.STREAM_ANSWER, (payload: StreamAnswerPayload) => {
    const { targetSocketId, sdp, roomId } = payload;
    if (targetSocketId && sdp) {
      io.to(targetSocketId).emit(SocketEvents.STREAM_ANSWER, {
        roomId,
        listenerSocketId: socket.id,
        sdp,
      });
    }
  });

  /**
   * 4. ICE Candidate exchange between Host and Listener
   */
  socket.on(SocketEvents.STREAM_ICE_CANDIDATE, (payload: StreamIceCandidatePayload) => {
    const { targetSocketId, candidate, roomId } = payload;
    if (targetSocketId && candidate) {
      io.to(targetSocketId).emit(SocketEvents.STREAM_ICE_CANDIDATE, {
        roomId,
        fromSocketId: socket.id,
        candidate,
      });
    }
  });

  /**
   * 5. Fallback Binary Audio Chunk Broadcast (for devices without P2P WebRTC)
   */
  socket.on(SocketEvents.STREAM_CHUNK, async (payload: StreamChunkPayload) => {
    const { roomId, chunk, timestamp } = payload;
    const stream = activeLiveStreams.get(roomId);
    if (stream) {
      // Relay audio chunk to all other listeners in the room
      socket.to(stream.roomCode).emit(SocketEvents.STREAM_CHUNK, {
        roomId,
        chunk,
        timestamp: timestamp || Date.now(),
      });
    }
  });

  /**
   * 6. Host Stops Live Audio Broadcast
   */
  socket.on(SocketEvents.STREAM_STOP, async (payload: { roomId: string }) => {
    try {
      const { roomId } = payload;
      const stream = activeLiveStreams.get(roomId);
      if (stream) {
        activeLiveStreams.delete(roomId);
        console.log(`[StreamHandler] 🛑 Live Audio Broadcast stopped in room ${stream.roomCode}`);
        io.to(stream.roomCode).emit(SocketEvents.STREAM_STOPPED, { roomId });
      }
    } catch (err: any) {
      console.error('[StreamHandler] Error stopping stream:', err);
    }
  });

  /**
   * 7. Clean up stream if broadcaster disconnects
   */
  socket.on('disconnect', () => {
    for (const [roomId, stream] of activeLiveStreams.entries()) {
      if (stream.broadcasterSocketId === socket.id) {
        activeLiveStreams.delete(roomId);
        console.log(`[StreamHandler] Broadcaster disconnected. Ended stream in ${stream.roomCode}`);
        io.to(stream.roomCode).emit(SocketEvents.STREAM_STOPPED, { roomId });
      }
    }
  });
}
