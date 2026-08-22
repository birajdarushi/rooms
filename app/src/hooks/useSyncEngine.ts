import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { audioEngine } from '../services/AudioEngine';
import { computeMedianClockOffset, calculateTargetPosition, NTPClockSample } from '../utils/syncMath';
import {
  Song,
  SocketEvents,
  PingPayload,
  PongPayload,
  PlayPayload,
  PausePayload,
  SeekPayload,
  SyncPulsePayload,
} from '../types';

export interface DriftReport {
  driftMs: number;
  expectedSec: number;
  actualSec: number;
  lastPulseAt: number;
  reseekTriggered: boolean;
}

export function useSyncEngine(socket: Socket | null, currentSong: Song | null) {
  const [clockOffset, setClockOffset] = useState<number>(0);
  const [latency, setLatency] = useState<number>(0);
  const [isSynced, setIsSynced] = useState<boolean>(false);
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null);

  const clockOffsetRef = useRef<number>(0);
  const currentSongRef = useRef<Song | null>(currentSong);

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  useEffect(() => {
    clockOffsetRef.current = clockOffset;
  }, [clockOffset]);

  // 1. Multi-Sample SNTP Clock Synchronization (Burst of 5 Pings)
  const performClockSync = useCallback(
    async (activeSocket: Socket): Promise<number> => {
      if (!activeSocket.connected) return 0;

      const samples: NTPClockSample[] = [];
      const TOTAL_SAMPLES = 5;

      for (let i = 0; i < TOTAL_SAMPLES; i++) {
        const t0 = Date.now();

        const sample = await new Promise<NTPClockSample | null>((resolve) => {
          const timeout = setTimeout(() => resolve(null), 2000);

          const handlePong = (pong: PongPayload) => {
            const t3 = Date.now();
            clearTimeout(timeout);
            activeSocket.off(SocketEvents.PONG, handlePong);

            resolve({
              t0: pong.clientSentAt,
              t1: pong.serverTime,
              t2: pong.serverTime,
              t3,
            });
          };

          activeSocket.on(SocketEvents.PONG, handlePong);
          const ping: PingPayload = { clientSentAt: t0 };
          activeSocket.emit(SocketEvents.PING, ping);
        });

        if (sample) {
          samples.push(sample);
        }

        // 120ms delay between samples
        if (i < TOTAL_SAMPLES - 1) {
          await new Promise((r) => setTimeout(r, 120));
        }
      }

      const result = computeMedianClockOffset(samples);
      console.log(`[SyncEngine] Clock offset: ${result.clockOffset}ms | RTT: ${result.medianRoundTrip}ms | samples: ${samples.length}`);

      setClockOffset(result.clockOffset);
      setLatency(result.medianRoundTrip);
      setIsSynced(true);
      return result.clockOffset;
    },
    []
  );

  // 2. Handle Playback Events & Dynamic Drift Convergence
  useEffect(() => {
    if (!socket) return;

    // A. Play Event
    const handlePlay = async (payload: PlayPayload) => {
      const activeOffset = clockOffsetRef.current;
      const activeSong = currentSongRef.current;

      const { targetPosition } = calculateTargetPosition({
        startedAt: payload.startedAt,
        offsetSeconds: payload.offsetSeconds,
        clockOffset: activeOffset,
        duration: activeSong?.duration,
      });

      console.log(`[SyncEngine] Received Play event -> Target position: ${targetPosition.toFixed(2)}s`);

      if (activeSong && (!audioEngine.getCurrentTrack() || audioEngine.getCurrentTrack()?.id !== payload.songId)) {
        await audioEngine.loadTrack(
          {
            id: activeSong.id,
            url: activeSong.storageUrl,
            title: activeSong.title,
            artist: activeSong.artist,
            duration: activeSong.duration,
          },
          true,
          targetPosition
        );
      } else {
        const currentPos = await audioEngine.getPosition();
        // Only seek if difference is meaningful (>100ms) to avoid disrupting active audio stream
        if (Math.abs(currentPos - targetPosition) > 0.1) {
          await audioEngine.seekTo(targetPosition);
        }
        await audioEngine.play();
      }
    };

    // B. Pause Event
    const handlePause = async (payload: PausePayload) => {
      console.log(`[SyncEngine] Received Pause event at ${payload.offsetSeconds.toFixed(2)}s`);
      await audioEngine.seekTo(payload.offsetSeconds);
      await audioEngine.pause();
    };

    // C. Seek Event
    const handleSeek = async (payload: SeekPayload) => {
      const isPlaying = payload.playbackState === 'playing' || (payload.startedAt !== null && payload.startedAt > 0);
      if (isPlaying && payload.startedAt) {
        const activeOffset = clockOffsetRef.current;
        const { targetPosition } = calculateTargetPosition({
          startedAt: payload.startedAt,
          offsetSeconds: payload.offsetSeconds,
          clockOffset: activeOffset,
          duration: currentSongRef.current?.duration,
        });

        console.log(`[SyncEngine] Received Seek event (playing) -> Seeking to ${targetPosition.toFixed(2)}s`);
        await audioEngine.seekTo(targetPosition);
        await audioEngine.play();
      } else {
        console.log(`[SyncEngine] Received Seek event (paused) -> Seeking to ${payload.offsetSeconds.toFixed(2)}s`);
        await audioEngine.seekTo(payload.offsetSeconds);
        await audioEngine.pause();
      }
    };

    // D. 2.5-Second Drift Correction Pulse with Multi-tier Adaptive Phase-Lock Nudging
    const handleSyncPulse = async (payload: SyncPulsePayload) => {
      if (payload.playbackState !== 'playing' || !payload.startedAt) {
        await audioEngine.setRate(1.0);
        return;
      }

      const activeOffset = clockOffsetRef.current;
      const { targetPosition: expectedPosition } = calculateTargetPosition({
        startedAt: payload.startedAt,
        offsetSeconds: payload.offsetSeconds,
        clockOffset: activeOffset,
        duration: currentSongRef.current?.duration,
      });

      const actualPosition = await audioEngine.getPosition();
      const diffSeconds = expectedPosition - actualPosition;
      const driftMs = Math.round(diffSeconds * 1000);
      const absDriftMs = Math.abs(driftMs);

      let reseekTriggered = false;

      if (absDriftMs > 350) {
        // Large drift (>350ms): Silent hard seek + reset normal rate
        console.warn(`[SyncEngine] High drift (${driftMs}ms). Reseeking to ${expectedPosition.toFixed(2)}s`);
        await audioEngine.seekTo(expectedPosition);
        await audioEngine.setRate(1.0);
        reseekTriggered = true;
      } else if (absDriftMs > 120) {
        // Moderate drift (120ms - 350ms): Nudge playback speed by ±2.5%
        const nudgedRate = driftMs > 0 ? 1.025 : 0.975;
        await audioEngine.setRate(nudgedRate);
      } else if (absDriftMs > 25) {
        // Micro drift (25ms - 120ms): Smooth micro-nudge of ±1.2% (completely inaudible, slides smoothly into phase)
        const nudgedRate = driftMs > 0 ? 1.012 : 0.988;
        await audioEngine.setRate(nudgedRate);
      } else {
        // In tight phase lock (<25ms): Exact 1.000x speed
        await audioEngine.setRate(1.0);
      }

      setDriftReport({
        driftMs,
        expectedSec: expectedPosition,
        actualSec: actualPosition,
        lastPulseAt: Date.now(),
        reseekTriggered,
      });
    };

    socket.on(SocketEvents.PLAY, handlePlay);
    socket.on(SocketEvents.PAUSE, handlePause);
    socket.on(SocketEvents.SEEK, handleSeek);
    socket.on(SocketEvents.SYNC_PULSE, handleSyncPulse);

    // Continuous background SNTP re-calibration every 15 seconds
    const sntpInterval = setInterval(() => {
      if (socket.connected) {
        performClockSync(socket).catch(() => {});
      }
    }, 15000);

    return () => {
      socket.off(SocketEvents.PLAY, handlePlay);
      socket.off(SocketEvents.PAUSE, handlePause);
      socket.off(SocketEvents.SEEK, handleSeek);
      socket.off(SocketEvents.SYNC_PULSE, handleSyncPulse);
      clearInterval(sntpInterval);
    };
  }, [socket, performClockSync]);

  return {
    clockOffset,
    latency,
    isSynced,
    driftReport,
    performClockSync,
  };
}
