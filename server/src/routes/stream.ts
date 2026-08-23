import { Router, Request, Response } from 'express';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

export const streamRouter = Router();

interface StreamSession {
  roomId: string;
  ffmpeg: ChildProcessWithoutNullStreams | null;
  subscribers: Set<Response>;
  headerBuffer: Buffer | null;
}

const activeStreamSessions = new Map<string, StreamSession>();

function getOrCreateStreamSession(roomId: string): StreamSession {
  let session = activeStreamSessions.get(roomId);
  if (!session) {
    let ffmpegProc: ChildProcessWithoutNullStreams | null = null;
    try {
      ffmpegProc = spawn('ffmpeg', [
        '-loglevel', 'error',
        '-fflags', '+nobuffer+flush_packets',
        '-flags', 'low_delay',
        '-probesize', '32',
        '-analyzeduration', '0',
        '-f', 'webm',
        '-i', 'pipe:0',
        '-f', 'mp3',
        '-acodec', 'libmp3lame',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        '-flush_packets', '1',
        '-write_xing', '0',
        '-id3v2_version', '0',
        'pipe:1',
      ]);

      session = {
        roomId,
        ffmpeg: ffmpegProc,
        subscribers: new Set<Response>(),
        headerBuffer: null,
      };

      ffmpegProc.stdout.on('data', (mp3Chunk: Buffer) => {
        if (!session) return;
        if (!session.headerBuffer && mp3Chunk.length > 0) {
          session.headerBuffer = mp3Chunk;
        }

        for (const res of session.subscribers) {
          try {
            res.write(mp3Chunk);
          } catch (e) {
            session.subscribers.delete(res);
          }
        }
      });

      ffmpegProc.stderr.on('data', (err) => {
        console.warn(`[StreamTranscoder ${roomId}]`, err.toString().trim());
      });

      ffmpegProc.on('close', () => {
        console.log(`[StreamTranscoder] Transcoder closed for room ${roomId}`);
      });
    } catch (err) {
      console.error('[StreamTranscoder] Failed to spawn ffmpeg:', err);
      session = {
        roomId,
        ffmpeg: null,
        subscribers: new Set<Response>(),
        headerBuffer: null,
      };
    }

    activeStreamSessions.set(roomId, session);
  }
  return session;
}

export function broadcastAudioChunk(roomId: string, chunk: Buffer) {
  const session = getOrCreateStreamSession(roomId);
  if (session.ffmpeg && session.ffmpeg.stdin.writable) {
    try {
      session.ffmpeg.stdin.write(chunk);
    } catch (e) {
      console.warn('[StreamTranscoder] Error writing chunk to ffmpeg:', e);
    }
  }
}

export function clearRoomStream(roomId: string) {
  const session = activeStreamSessions.get(roomId);
  if (session) {
    if (session.ffmpeg) {
      try {
        session.ffmpeg.stdin.end();
        session.ffmpeg.kill('SIGTERM');
      } catch (e) {}
    }
    for (const res of session.subscribers) {
      try {
        res.end();
      } catch (e) {}
    }
    activeStreamSessions.delete(roomId);
  }
}

/**
 * GET /api/stream/:roomId/live
 * GET /api/stream/:roomId/live.mp3
 * Continuous Native MP3 Live Stream for Android Expo Go and iOS devices
 */
const handleLiveStreamRequest = async (req: Request, res: Response) => {
  const { roomId } = req.params;

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const session = getOrCreateStreamSession(roomId);

  if (session.headerBuffer) {
    try {
      res.write(session.headerBuffer);
    } catch (e) {}
  }

  session.subscribers.add(res);
  console.log(`[StreamRouter] 📱 Android Native connected to live MP3 stream (${roomId}). Total: ${session.subscribers.size}`);

  req.on('close', () => {
    session.subscribers.delete(res);
    console.log(`[StreamRouter] Android listener disconnected (${roomId}). Remaining: ${session.subscribers.size}`);
  });
};

streamRouter.get('/:roomId/live', handleLiveStreamRequest);
streamRouter.get('/:roomId/live.mp3', handleLiveStreamRequest);
