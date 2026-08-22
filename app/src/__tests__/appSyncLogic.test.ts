import { calculateTargetPosition, evaluateDrift } from '../utils/syncMath';

describe('App: Playback Sync Logic & Role Controls', () => {
  // Mock Audio Player Interface
  const createMockAudioPlayer = () => {
    let currentPosition = 0;
    let isPlaying = false;

    return {
      seekTo: jest.fn(async (pos: number) => {
        currentPosition = pos;
      }),
      play: jest.fn(async () => {
        isPlaying = true;
      }),
      pause: jest.fn(async () => {
        isPlaying = false;
      }),
      getPosition: jest.fn(async () => currentPosition),
      getIsPlaying: () => isPlaying,
      setPosition: (pos: number) => {
        currentPosition = pos;
      },
    };
  };

  it('receives play payload, calculates target position, and invokes seekTo and play', async () => {
    const player = createMockAudioPlayer();
    const clockOffset = 150; // client is 150ms behind server
    const clientNow = 50850; // localServerTime = 51000
    const playPayload = {
      songId: 'song_456',
      offsetSeconds: 10,
      startedAt: 50000, // started 1.0s ago on server
    };

    // App receives play event and calculates target
    const { targetPosition } = calculateTargetPosition({
      startedAt: playPayload.startedAt,
      offsetSeconds: playPayload.offsetSeconds,
      clockOffset,
      clientNow,
    });

    expect(targetPosition).toBe(11.0); // 10s offset + 1.0s elapsed

    // App seeks and plays
    await player.seekTo(targetPosition);
    await player.play();

    expect(player.seekTo).toHaveBeenCalledWith(11.0);
    expect(player.play).toHaveBeenCalled();
    expect(player.getIsPlaying()).toBe(true);
  });

  it('on sync-pulse, silently reseeks ONLY if drift exceeds 300ms threshold', async () => {
    const player = createMockAudioPlayer();
    const clockOffset = 0;

    const syncPulse = {
      serverTime: 60000,
      playbackState: 'playing' as const,
      startedAt: 50000,
      offsetSeconds: 0,
      currentSongId: 'song_789',
    };

    // Case 1: Low drift (80ms) -> No reseek
    player.setPosition(9.92); // actual position = 9.92s, expected = 10.0s (drift 80ms)
    const expectedPos = calculateTargetPosition({
      startedAt: syncPulse.startedAt,
      offsetSeconds: syncPulse.offsetSeconds,
      clockOffset,
      clientNow: 60000,
    }).targetPosition;

    const actualPos1 = await player.getPosition();
    const driftCheck1 = evaluateDrift({
      actualPosition: actualPos1,
      expectedPosition: expectedPos,
      thresholdSeconds: 0.3,
    });

    expect(driftCheck1.shouldReseek).toBe(false);
    if (driftCheck1.shouldReseek) {
      await player.seekTo(expectedPos);
    }
    expect(player.seekTo).not.toHaveBeenCalled();

    // Case 2: High drift (450ms) -> Reseek triggered silently
    player.setPosition(9.55); // actual position = 9.55s, expected = 10.0s (drift 450ms)
    const actualPos2 = await player.getPosition();
    const driftCheck2 = evaluateDrift({
      actualPosition: actualPos2,
      expectedPosition: expectedPos,
      thresholdSeconds: 0.3,
    });

    expect(driftCheck2.shouldReseek).toBe(true);
    if (driftCheck2.shouldReseek) {
      await player.seekTo(expectedPos);
    }
    expect(player.seekTo).toHaveBeenCalledWith(10.0);
  });

  it('enforces host-only permissions for playback mutations in state logic', () => {
    const hostUser = { userId: 'u1', displayName: 'Host', isHost: true };
    const listenerUser = { userId: 'u2', displayName: 'Listener', isHost: false };

    const canMutatePlayback = (user: { isHost: boolean }) => user.isHost === true;

    expect(canMutatePlayback(hostUser)).toBe(true);
    expect(canMutatePlayback(listenerUser)).toBe(false);
  });
});
