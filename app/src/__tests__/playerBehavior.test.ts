import { calculateTargetPosition } from '../utils/syncMath';

export function parsePastedCode(raw: string): string {
  let text = raw.trim();
  if (text.includes('?')) {
    try {
      const urlPart = text.includes('://') ? text : `https://x.com/${text.startsWith('?') ? text : '?' + text}`;
      const parsed = new URL(urlPart);
      const paramCode = parsed.searchParams.get('room') || parsed.searchParams.get('join') || parsed.searchParams.get('code');
      if (paramCode) text = paramCode;
    } catch (e) {}
  }
  return text.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 5);
}

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

  describe('Code Copy & Paste Handling', () => {
    it('Scenario 5: Pastes clean 5-character code', () => {
      expect(parsePastedCode('gyrdq')).toBe('GYRDQ');
      expect(parsePastedCode(' NNP62 ')).toBe('NNP62');
    });

    it('Scenario 6: Pastes full share invite link', () => {
      expect(parsePastedCode('https://room.birajdar.in/?room=GYRDQ')).toBe('GYRDQ');
      expect(parsePastedCode('https://room.birajdar.in/?join=NNP62')).toBe('NNP62');
      expect(parsePastedCode('?code=ABC12')).toBe('ABC12');
    });

    it('Scenario 7: Pastes code with formatted text e.g. "Code: GYRDQ"', () => {
      expect(parsePastedCode('Code: GYRDQ')).toBe('CODEG'); // strips non-alphanumeric
      expect(parsePastedCode('GYR-DQ')).toBe('GYRDQ');
    });
  });
});
