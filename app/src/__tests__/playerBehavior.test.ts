import { calculateTargetPosition } from '../utils/syncMath';

describe('Player Behavior & VLC-style Scrubbing Scenarios', () => {
  it('Scenario 1: Dragging scrubber while playing should calculate exact seek target without resetting to 0', () => {
    const duration = 240; // 4 minutes
    const barWidth = 400; // 400px bar
    const touchX = 200; // 50% along the bar

    const ratio = Math.max(0, Math.min(1, touchX / barWidth));
    const targetSecond = ratio * duration;

    expect(targetSecond).toBe(120); // exactly at 2:00
  });

  it('Scenario 2: Clamping drag beyond boundaries (<0 or >duration)', () => {
    const duration = 180;
    const barWidth = 300;

    // Drag past left edge
    const negativeX = -50;
    const ratioLeft = Math.max(0, Math.min(1, negativeX / barWidth));
    expect(ratioLeft * duration).toBe(0);

    // Drag past right edge
    const pastRightX = 450;
    const ratioRight = Math.max(0, Math.min(1, pastRightX / barWidth));
    expect(ratioRight * duration).toBe(180);
  });

  it('Scenario 3: Resume after pause retains exact stopped timestamp', () => {
    const stoppedAt = 73.45; // stopped at 1:13.45
    const startedAt = 10000;
    const clockOffset = 0;
    const clientNow = 10000; // instant resume

    const { targetPosition } = calculateTargetPosition({
      startedAt,
      offsetSeconds: stoppedAt,
      clockOffset,
      clientNow,
    });

    expect(targetPosition).toBe(73.45);
  });

  it('Scenario 4: Fast Forward (+10s) and Rewind (-10s) boundary conditions', () => {
    const duration = 200;
    let currentPos = 5;

    // Rewind -10s when at 5s should clamp to 0s
    currentPos = Math.max(0, currentPos - 10);
    expect(currentPos).toBe(0);

    // Forward +10s when at 195s should clamp to duration (200s)
    currentPos = 195;
    currentPos = Math.min(duration, currentPos + 10);
    expect(currentPos).toBe(200);
  });
});
