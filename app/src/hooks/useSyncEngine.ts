import { useState, useEffect, useRef, useCallback } from 'react';
import { audioEngine } from '../services/AudioEngine';
import { calculateTargetPosition } from '../utils/syncMath';
import { Song } from '../types';
import { getApiBaseUrl } from '../api/client';

export interface DriftReport {
  driftMs: number;
  expectedSec: number;
  actualSec: number;
  lastPulseAt: number;
  reseekTriggered: boolean;
}

/**
 * HTTP-based clock synchronization — replaces Socket.io PING/PONG.
 * Uses NTP-style RTT measurement against GET /api/sync/clock.
 */
export function useSyncEngine(_socket: null, currentSong: Song | null) {
  const [clockOffset, setClockOffset] = useState<number>(0);
  const [latency, setLatency] = useState<number>(0);
  const [isSynced, setIsSynced] = useState<boolean>(false);
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null);

  const clockOffsetRef = useRef<number>(0);
  const currentSongRef = useRef<Song | null>(currentSong);

  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { clockOffsetRef.current = clockOffset; }, [clockOffset]);

  /**
   * Perform multi-sample HTTP clock sync.
   * Measures RTT to /api/sync/clock and computes offset using median of 5 samples.
   */
  const performClockSync = useCallback(async (_ignored: any): Promise<number> => {
    const BASE_URL = getApiBaseUrl();
    const SAMPLES = 5;
    const offsets: number[] = [];
    const rtts: number[] = [];

    for (let i = 0; i < SAMPLES; i++) {
      try {
        const t0 = Date.now();
        const res = await fetch(`${BASE_URL}/api/sync/clock`, { cache: 'no-store' });
        const t3 = Date.now();

        if (res.ok) {
          const { serverTime } = await res.json();
          const rtt = t3 - t0;
          const offset = serverTime - (t0 + t3) / 2;
          offsets.push(offset);
          rtts.push(rtt);
        }
      } catch (_) {}

      if (i < SAMPLES - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    if (offsets.length === 0) return 0;

    // Median offset
    offsets.sort((a, b) => a - b);
    rtts.sort((a, b) => a - b);
    const medianOffset = offsets[Math.floor(offsets.length / 2)];
    const medianRtt = rtts[Math.floor(rtts.length / 2)];

    console.log(`[SyncEngine] Clock offset: ${medianOffset.toFixed(1)}ms | RTT: ${medianRtt}ms`);

    setClockOffset(medianOffset);
    setLatency(medianRtt);
    setIsSynced(true);
    clockOffsetRef.current = medianOffset;
    return medianOffset;
  }, []);

  // Re-calibrate clock every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      performClockSync(null).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [performClockSync]);

  return {
    clockOffset,
    latency,
    isSynced,
    driftReport,
    performClockSync,
  };
}
