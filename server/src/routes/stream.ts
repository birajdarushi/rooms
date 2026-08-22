import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';

export const streamRouter = Router();

// Active HTTP stream subscribers per room
const streamSubscribers = new Map<string, Set<Response>>();
const streamHeaderBuffers = new Map<string, Buffer>();

export function broadcastAudioChunk(roomId: string, chunk: Buffer) {
  // Store initial header chunk for late connecting clients
  if (!streamHeaderBuffers.has(roomId) && chunk.length > 0) {
    streamHeaderBuffers.set(roomId, chunk);
  }

  const subscribers = streamSubscribers.get(roomId);
  if (subscribers && subscribers.size > 0) {
    for (const res of subscribers) {
      try {
        res.write(chunk);
      } catch (e) {
        subscribers.delete(res);
      }
    }
  }
}

export function clearRoomStream(roomId: string) {
  const subscribers = streamSubscribers.get(roomId);
  if (subscribers) {
    for (const res of subscribers) {
      try {
        res.end();
      } catch (e) {}
    }
    streamSubscribers.delete(roomId);
  }
  streamHeaderBuffers.delete(roomId);
}

/**
 * GET /api/stream/:roomId/live
 * Continuous HTTP Chunked Audio Stream for Android Native Expo Go and Web clients
 */
streamRouter.get('/:roomId/live', async (req: Request, res: Response) => {
  const { roomId } = req.params;

  res.setHeader('Content-Type', 'audio/webm; codecs=opus');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let subscribers = streamSubscribers.get(roomId);
  if (!subscribers) {
    subscribers = new Set<Response>();
    streamSubscribers.set(roomId, subscribers);
  }

  // Send header chunk if already captured
  const header = streamHeaderBuffers.get(roomId);
  if (header) {
    res.write(header);
  }

  subscribers.add(res);

  console.log(`[StreamRouter] 📱 Client connected to live audio stream for room ${roomId}. Total subscribers: ${subscribers.size}`);

  req.on('close', () => {
    subscribers?.delete(res);
    console.log(`[StreamRouter] Client disconnected from live stream ${roomId}. Remaining: ${subscribers?.size || 0}`);
  });
});
