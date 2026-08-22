import {
  calculateSampleOffset,
  computeMedianClockOffset,
  calculateTargetPosition,
  evaluateDrift,
} from '../utils/syncMath';

describe('App: Sync Math & Clock Calibration', () => {
  it('calculates clock offset with median filtering', () => {
    const samples = [
      { clientSentAt: 100, serverTime: 210, clientReceivedAt: 120 },
      { clientSentAt: 200, serverTime: 310, clientReceivedAt: 220 },
      { clientSentAt: 300, serverTime: 410, clientReceivedAt: 320 },
    ];

    const { clockOffset, samplesUsed } = computeMedianClockOffset(samples);
    expect(clockOffset).toBe(100);
    expect(samplesUsed).toBe(3);
  });

  it('computes target playback position for in-sync play', () => {
    const { targetPosition } = calculateTargetPosition({
      startedAt: 10000,
      offsetSeconds: 5,
      clockOffset: 500,
      clientNow: 12500, // localServerTime = 13000 -> elapsed = 3s
    });

    expect(targetPosition).toBe(8); // 5 + 3 = 8s
  });
});
