import {
  calculateSampleOffset,
  computeMedianClockOffset,
  calculateTargetPosition,
  evaluateDrift,
  PingPongSample,
} from '../utils/syncMath';

describe('Sync Mechanism — Pure Math & Logic (Load-Bearing)', () => {
  describe('1. Clock Offset Calculation', () => {
    it('calculates single sample clock offset correctly given ping/pong timestamps', () => {
      // Client sends ping at t=1000
      // Server receives and responds at serverTime=2050
      // Client receives pong at t=1100
      // roundTrip = 100ms, latency = 50ms
      // clockOffset = serverTime + latency - clientReceivedAt = 2050 + 50 - 1100 = 1000ms
      const sample: PingPongSample = {
        clientSentAt: 1000,
        serverTime: 2050,
        clientReceivedAt: 1100,
      };

      const result = calculateSampleOffset(sample);
      expect(result.roundTrip).toBe(100);
      expect(result.estimatedLatency).toBe(50);
      expect(result.clockOffset).toBe(1000);
    });

    it('correctly discards outlier latency spikes using median-of-5 sampling', () => {
      // 5 samples: 4 normal (~1000ms offset) and 1 extreme network jitter spike
      const samples: PingPongSample[] = [
        { clientSentAt: 1000, serverTime: 2020, clientReceivedAt: 1040 }, // RTT 40, Lat 20, Offset 1000
        { clientSentAt: 2000, serverTime: 3025, clientReceivedAt: 2050 }, // RTT 50, Lat 25, Offset 1000
        { clientSentAt: 3000, serverTime: 4400, clientReceivedAt: 3800 }, // SPIKE: RTT 800, Lat 400, Offset 1000 (even with high latency)
        { clientSentAt: 4000, serverTime: 5015, clientReceivedAt: 4030 }, // RTT 30, Lat 15, Offset 1000
        { clientSentAt: 5000, serverTime: 6020, clientReceivedAt: 5040 }, // RTT 40, Lat 20, Offset 1000
      ];

      const result = computeMedianClockOffset(samples);
      expect(result.clockOffset).toBe(1000);
      expect(result.samplesUsed).toBe(5);
    });

    it('handles negative clock offsets when client clock is ahead of server', () => {
      // Client clock ahead by 500ms
      const sample: PingPongSample = {
        clientSentAt: 2000,
        serverTime: 1510,
        clientReceivedAt: 2020,
      };

      const result = calculateSampleOffset(sample);
      expect(result.roundTrip).toBe(20);
      expect(result.estimatedLatency).toBe(10);
      expect(result.clockOffset).toBe(-500); // 1510 + 10 - 2020 = -500
    });
  });

  describe('2. Play and Seek Target Position Calculation', () => {
    it('computes target playback position from startedAt, offsetSeconds, and clockOffset', () => {
      const serverStartedAt = 10000; // Server epoch ms
      const offsetSeconds = 15; // Started playing from 15s into the track
      const clockOffset = 2000; // Client is 2000ms behind server
      const clientNow = 13000; // Client time: 13000 -> Local Server Time = 15000

      // Elapsed on server = (15000 - 10000) / 1000 = 5s
      // Target position = 15 + 5 = 20s
      const { targetPosition, elapsedSeconds } = calculateTargetPosition({
        startedAt: serverStartedAt,
        offsetSeconds,
        clockOffset,
        clientNow,
      });

      expect(elapsedSeconds).toBe(5);
      expect(targetPosition).toBe(20);
    });

    it('handles late-joiner syncing into an in-progress song mid-playback', () => {
      // Song started on server 45.5 seconds ago at offset 0
      const serverStartedAt = 100000;
      const clockOffset = 0;
      const clientNow = 145500; // 45.5 seconds later

      const { targetPosition, elapsedSeconds } = calculateTargetPosition({
        startedAt: serverStartedAt,
        offsetSeconds: 0,
        clockOffset,
        clientNow,
      });

      expect(elapsedSeconds).toBe(45.5);
      expect(targetPosition).toBe(45.5);
    });

    it('clamps target position to song duration if duration is provided', () => {
      const serverStartedAt = 1000;
      const clockOffset = 0;
      const clientNow = 500000; // Far in the future
      const duration = 180; // 3 minute song

      const { targetPosition } = calculateTargetPosition({
        startedAt: serverStartedAt,
        offsetSeconds: 0,
        clockOffset,
        clientNow,
        duration,
      });

      expect(targetPosition).toBe(180);
    });
  });

  describe('3. Drift Correction & 300ms Tolerance Evaluation', () => {
    it('does NOT trigger reseek when drift is under 300ms (e.g. 80ms drift)', () => {
      const actualPosition = 45.08;
      const expectedPosition = 45.0; // 80ms difference

      const { driftSeconds, shouldReseek } = evaluateDrift({
        actualPosition,
        expectedPosition,
        thresholdSeconds: 0.3,
      });

      expect(driftSeconds).toBeCloseTo(0.08, 4);
      expect(shouldReseek).toBe(false);
    });

    it('triggers silent reseek when drift exceeds 300ms threshold (e.g. 520ms drift)', () => {
      const actualPosition = 44.48;
      const expectedPosition = 45.0; // 520ms difference

      const { driftSeconds, shouldReseek } = evaluateDrift({
        actualPosition,
        expectedPosition,
        thresholdSeconds: 0.3,
      });

      expect(driftSeconds).toBeCloseTo(0.52, 4);
      expect(shouldReseek).toBe(true);
    });

    it('evaluates exact 300ms boundary correctly', () => {
      const res300 = evaluateDrift({
        actualPosition: 10.0,
        expectedPosition: 10.3,
        thresholdSeconds: 0.3,
      });
      expect(res300.shouldReseek).toBe(false);

      const res301 = evaluateDrift({
        actualPosition: 10.0,
        expectedPosition: 10.301,
        thresholdSeconds: 0.3,
      });
      expect(res301.shouldReseek).toBe(true);
    });
  });
});
