import { Server as SocketIOServer, Socket } from 'socket.io';
import { SocketEvents, StreamStartPayload, StreamOfferPayload, StreamAnswerPayload, StreamIceCandidatePayload, StreamChunkPayload } from '../shared';
import { prisma } from '../db/prisma';
import { broadcastAudioChunk, clearRoomStream } from '../routes/stream';

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
      activeLiveStreams.set(room.code, streamInfo);

      console.log(`[StreamHandler] 🎙️ Live Audio Broadcast started in room ${room.code} by host socket ${socket.id}`);

      // Broadcast to all room members that live stream is active
      io.to(room.code).emit(SocketEvents.STREAM_STARTED, {
        roomId,
        roomCode: room.code,
        broadcasterSocketId: socket.id,
        title,
        startedAt: streamInfo.startedAt,
      });
    } catch (err: any) {
      console.error('[StreamHandler] Error starting stream:', err);
    }
  });

  /**
   * 2. Listener Requests to Join Live Audio Stream (Triggers WebRTC Handshake)
   */
  socket.on(SocketEvents.STREAM_JOIN, (payload: { roomId: string; roomCode?: string }) => {
    const { roomId, roomCode } = payload;
    const stream = (roomId && activeLiveStreams.get(roomId)) || (roomCode && activeLiveStreams.get(roomCode));
    if (stream) {
      console.log(`[StreamHandler] 🎧 Listener ${socket.id} joined live stream in ${stream.roomCode}. Requesting SDP Offer from host ${stream.broadcasterSocketId}`);
      io.to(stream.broadcasterSocketId).emit(SocketEvents.STREAM_LISTENER_JOINED, {
        roomId: stream.roomId,
        roomCode: stream.roomCode,
        listenerSocketId: socket.id,
      });
    }
  });

  /**
   * 3. Host Sends WebRTC SDP Offer to a specific listener
   */
  socket.on(SocketEvents.STREAM_OFFER, (payload: StreamOfferPayload) => {
    const { targetSocketId, sdp, roomId } = payload;
    if (targetSocketId && sdp) {
      console.log(`[StreamHandler] 📡 Relaying SDP Offer from host ${socket.id} to listener ${targetSocketId}`);
      io.to(targetSocketId).emit(SocketEvents.STREAM_OFFER, {
        roomId,
        broadcasterSocketId: socket.id,
        sdp,
      });
    }
  });

  /**
   * 4. Listener Sends WebRTC SDP Answer back to Host
   */
  socket.on(SocketEvents.STREAM_ANSWER, (payload: StreamAnswerPayload) => {
    const { targetSocketId, sdp, roomId } = payload;
    if (targetSocketId && sdp) {
      console.log(`[StreamHandler] 📡 Relaying SDP Answer from listener ${socket.id} to host ${targetSocketId}`);
      io.to(targetSocketId).emit(SocketEvents.STREAM_ANSWER, {
        roomId,
        listenerSocketId: socket.id,
        sdp,
      });
    }
  });

  /**
   * 5. ICE Candidate exchange between Host and Listener
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
   * 6. Binary Audio Chunk Broadcast (Relayed to HTTP stream and socket listeners)
   */
  socket.on(SocketEvents.STREAM_CHUNK, async (payload: StreamChunkPayload) => {
    const { roomId, chunk, timestamp } = payload;
    const stream = activeLiveStreams.get(roomId);
    if (stream && chunk) {
      try {
        let buf: Buffer;
        if (typeof chunk === 'string') {
          const base64Data = chunk.replace(/^data:audio\/\w+;base64,/, '');
          buf = Buffer.from(base64Data, 'base64');
        } else {
          buf = Buffer.from(chunk);
        }
        broadcastAudioChunk(roomId, buf);
      } catch (e) {}

      socket.to(stream.roomCode).emit(SocketEvents.STREAM_CHUNK, {
        roomId,
        chunk,
        timestamp: timestamp || Date.now(),
      });
    }
  });

  /**
   * 7. Host Stops Live Audio Broadcast
   */
  socket.on(SocketEvents.STREAM_STOP, async (payload: { roomId: string }) => {
    try {
      const { roomId } = payload;
      const stream = activeLiveStreams.get(roomId);
      if (stream) {
        activeLiveStreams.delete(roomId);
        activeLiveStreams.delete(stream.roomCode);
        clearRoomStream(roomId);
        console.log(`[StreamHandler] 🛑 Live Audio Broadcast stopped in room ${stream.roomCode}`);
        io.to(stream.roomCode).emit(SocketEvents.STREAM_STOPPED, { roomId });
      }
    } catch (err: any) {
      console.error('[StreamHandler] Error stopping stream:', err);
    }
  });

  /**
   * 8. Clean up stream if broadcaster disconnects
   */
  socket.on('disconnect', () => {
    for (const [roomId, stream] of activeLiveStreams.entries()) {
      if (stream.broadcasterSocketId === socket.id) {
        activeLiveStreams.delete(roomId);
        activeLiveStreams.delete(stream.roomCode);
        console.log(`[StreamHandler] Broadcaster disconnected. Ended stream in ${stream.roomCode}`);
        io.to(stream.roomCode).emit(SocketEvents.STREAM_STOPPED, { roomId });
      }
    }
  });
}
