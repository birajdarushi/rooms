/**
 * Load-Bearing Clock & Playback Synchronization Math
 */

export interface PingPongSample {
  clientSentAt: number;
  serverTime: number;
  clientReceivedAt: number;
}

export interface ComputedSyncSample {
  roundTrip: number;
  estimatedLatency: number;
  clockOffset: number;
}

/**
 * Calculates a single clock offset sample from a ping/pong response.
 *
 * roundTrip = clientReceivedAt - clientSentAt
 * estimatedLatency = roundTrip / 2
 * clockOffset = serverTime + estimatedLatency - clientReceivedAt
 *
 * Such that: Local Server Time = Date.now() + clockOffset
 */
export function calculateSampleOffset(sample: PingPongSample): ComputedSyncSample {
  const roundTrip = Math.max(0, sample.clientReceivedAt - sample.clientSentAt);
  const estimatedLatency = roundTrip / 2;
  const clockOffset = sample.serverTime + estimatedLatency - sample.clientReceivedAt;

  return {
    roundTrip,
    estimatedLatency,
    clockOffset,
  };
}

/**
 * Computes median clock offset from 3-5 ping/pong samples, discarding network latency outliers.
 */
export function computeMedianClockOffset(samples: PingPongSample[]): {
  clockOffset: number;
  medianRoundTrip: number;
  samplesUsed: number;
} {
  if (samples.length === 0) {
    return { clockOffset: 0, medianRoundTrip: 0, samplesUsed: 0 };
  }

  const computed = samples.map(calculateSampleOffset);

  // Sort by clockOffset to find median
  const sortedOffsets = [...computed].map((c) => c.clockOffset).sort((a, b) => a - b);
  const sortedRtts = [...computed].map((c) => c.roundTrip).sort((a, b) => a - b);

  const mid = Math.floor(sortedOffsets.length / 2);
  const medianOffset =
    sortedOffsets.length % 2 !== 0
      ? sortedOffsets[mid]
      : (sortedOffsets[mid - 1] + sortedOffsets[mid]) / 2;

  const medianRtt =
    sortedRtts.length % 2 !== 0
      ? sortedRtts[mid]
      : (sortedRtts[mid - 1] + sortedRtts[mid]) / 2;

  return {
    clockOffset: Math.round(medianOffset),
    medianRoundTrip: Math.round(medianRtt),
    samplesUsed: samples.length,
  };
}

/**
 * Calculates the exact playback target position in seconds.
 *
 * localServerTime = clientCurrentTime + clockOffset
 * elapsed = (localServerTime - startedAt) / 1000
 * targetPosition = offsetSeconds + elapsed
 */
export function calculateTargetPosition(params: {
  startedAt: number | null;
  offsetSeconds: number;
  clockOffset: number;
  clientNow?: number;
  duration?: number;
}): { targetPosition: number; elapsedSeconds: number } {
  const { startedAt, offsetSeconds, clockOffset, clientNow = Date.now(), duration } = params;

  if (startedAt === null || startedAt === undefined) {
    return { targetPosition: offsetSeconds, elapsedSeconds: 0 };
  }

  const localServerTime = clientNow + clockOffset;
  const elapsedSeconds = Math.max(0, (localServerTime - startedAt) / 1000);
  let targetPosition = offsetSeconds + elapsedSeconds;

  if (duration && duration > 0) {
    targetPosition = Math.min(targetPosition, duration);
  }

  return {
    targetPosition: Math.round(targetPosition * 1000) / 1000,
    elapsedSeconds: Math.round(elapsedSeconds * 1000) / 1000,
  };
}

/**
 * Evaluates whether drift between player's actual position and expected position
 * exceeds the 300ms (0.3s) tolerance threshold.
 */
export function evaluateDrift(params: {
  actualPosition: number;
  expectedPosition: number;
  thresholdSeconds?: number;
}): { driftSeconds: number; shouldReseek: boolean } {
  const { actualPosition, expectedPosition, thresholdSeconds = 0.3 } = params;
  const driftSeconds = Math.round(Math.abs(expectedPosition - actualPosition) * 1000) / 1000;

  return {
    driftSeconds,
    shouldReseek: driftSeconds > thresholdSeconds,
  };
}
