import { useState, useEffect, useRef, useCallback } from 'react';
import { getAblyChannel, closeAbly } from '../services/AblyService';
import { getApiBaseUrl } from '../api/client';
import { audioEngine } from '../services/AudioEngine';
import { useSyncEngine } from './useSyncEngine';
import { calculateTargetPosition } from '../utils/syncMath';
import {
  Room,
  Song,
  QueueItem,
  UserSession,
  SocketEvents,
  HostStatusPayload,
  RoomEndedPayload,
  RoomStateSyncPayload,
  SongChangedPayload,
  PlaybackStatus,
} from '../types';

export function useRoomSocket(initialRoom: Room, user: UserSession, onRoomEnded: (reason: string) => void) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [memberCount, setMemberCount] = useState<number>(1);
  const [playbackState, setPlaybackState] = useState<PlaybackStatus>(initialRoom.playbackState);
  const [hostStatus, setHostStatus] = useState<HostStatusPayload>({ isHostConnected: true });
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLiveStreaming] = useState<boolean>(false);

  const { clockOffset, latency, isSynced, driftReport, performClockSync } = useSyncEngine(
    null,
    currentSong
  );

  const roomRef = useRef<Room>(initialRoom);
  const userRef = useRef<UserSession>(user);
  const currentSongRef = useRef<Song | null>(null);
  const clockOffsetRef = useRef<number>(0);

  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { clockOffsetRef.current = clockOffset; }, [clockOffset]);

  // ─────────────────────────────────────────────────────────────────
  // Initialize Ably subscription + seed state from join response
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const roomCode = initialRoom.code;
    const channel = getAblyChannel(roomCode);

    // Apply initial room state passed from the join response
    const seed = (initialRoom as any)._seedState;
    if (seed) {
      setQueue(seed.queue ?? []);
      setPlaybackState(seed.playbackState ?? 'idle');
      if (seed.currentSong) {
        setCurrentSong(seed.currentSong);
        const isPlaying = seed.playbackState === 'playing';
        const targetPos = calculateTargetPosition({
          startedAt: seed.startedAt,
          offsetSeconds: seed.offsetSeconds,
          clockOffset: 0,
          duration: seed.currentSong.duration,
        }).targetPosition;

        audioEngine.loadTrack(
          {
            id: seed.currentSong.id,
            url: seed.currentSong.storageUrl,
            title: seed.currentSong.title,
            artist: seed.currentSong.artist,
            duration: seed.currentSong.duration,
          },
          isPlaying,
          targetPos
        ).catch(() => {});
      }
    }

    // Perform initial clock sync via HTTP
    performClockSync(null as any).catch(() => {});

    // Subscribe to Ably channel events
    channel.subscribe(SocketEvents.QUEUE_UPDATED, (msg) => {
      const payload = msg.data as { queue: QueueItem[] };
      console.log(`[Ably] QUEUE_UPDATED: ${payload.queue.length} songs`);
      setQueue(payload.queue);
    });

    channel.subscribe(SocketEvents.SONG_CHANGED, async (msg) => {
      const payload = msg.data as SongChangedPayload;
      console.log(`[Ably] SONG_CHANGED: ${payload.currentSong?.title ?? 'None'}`);
      setCurrentSong(payload.currentSong);
      setPlaybackState(payload.playbackState as PlaybackStatus);

      if (payload.currentSong) {
        const isPlaying = payload.playbackState === 'playing';
        const targetPos = calculateTargetPosition({
          startedAt: payload.startedAt,
          offsetSeconds: payload.offsetSeconds,
          clockOffset: clockOffsetRef.current,
          duration: payload.currentSong.duration,
        }).targetPosition;

        await audioEngine.loadTrack(
          {
            id: payload.currentSong.id,
            url: payload.currentSong.storageUrl,
            title: payload.currentSong.title,
            artist: payload.currentSong.artist,
            duration: payload.currentSong.duration,
          },
          isPlaying,
          targetPos
        );
      } else {
        await audioEngine.unload();
      }
    });

    channel.subscribe(SocketEvents.PLAY, async (msg) => {
      const payload = msg.data;
      console.log('[Ably] PLAY event received');
      setPlaybackState('playing');

      const targetPos = calculateTargetPosition({
        startedAt: payload.startedAt,
        offsetSeconds: payload.offsetSeconds,
        clockOffset: clockOffsetRef.current,
        duration: currentSongRef.current?.duration,
      }).targetPosition;

      const current = audioEngine.getCurrentTrack();
      if (current && current.id !== payload.songId) {
        // Different song — skip
      } else if (!current) {
        // No track loaded
      } else {
        const pos = await audioEngine.getPosition();
        if (Math.abs(pos - targetPos) > 0.1) {
          await audioEngine.seekTo(targetPos);
        }
        await audioEngine.play();
      }
    });

    channel.subscribe(SocketEvents.PAUSE, async (msg) => {
      const payload = msg.data;
      console.log('[Ably] PAUSE event received');
      setPlaybackState('paused');
      await audioEngine.seekTo(payload.offsetSeconds);
      await audioEngine.pause();
    });

    channel.subscribe(SocketEvents.SEEK, async (msg) => {
      const payload = msg.data;
      console.log('[Ably] SEEK event received to', payload.offsetSeconds);
      if (payload.playbackState) setPlaybackState(payload.playbackState as PlaybackStatus);

      const isPlaying = payload.playbackState === 'playing';
      if (isPlaying && payload.startedAt) {
        const targetPos = calculateTargetPosition({
          startedAt: payload.startedAt,
          offsetSeconds: payload.offsetSeconds,
          clockOffset: clockOffsetRef.current,
          duration: currentSongRef.current?.duration,
        }).targetPosition;
        await audioEngine.seekTo(targetPos);
        await audioEngine.play();
      } else {
        await audioEngine.seekTo(payload.offsetSeconds);
        await audioEngine.pause();
      }
    });

    channel.subscribe(SocketEvents.SYNC_PULSE, async (msg) => {
      const payload = msg.data;
      if (payload.playbackState !== 'playing' || !payload.startedAt) {
        await audioEngine.setRate(1.0);
        return;
      }

      const { targetPosition: expected } = calculateTargetPosition({
        startedAt: payload.startedAt,
        offsetSeconds: payload.offsetSeconds,
        clockOffset: clockOffsetRef.current,
        duration: currentSongRef.current?.duration,
      });

      const actual = await audioEngine.getPosition();
      const diffMs = (expected - actual) * 1000;
      const absDiff = Math.abs(diffMs);

      if (absDiff > 350) {
        await audioEngine.seekTo(expected);
        await audioEngine.setRate(1.0);
      } else if (absDiff > 120) {
        await audioEngine.setRate(diffMs > 0 ? 1.025 : 0.975);
      } else if (absDiff > 25) {
        await audioEngine.setRate(diffMs > 0 ? 1.012 : 0.988);
      } else {
        await audioEngine.setRate(1.0);
      }
    });

    channel.subscribe(SocketEvents.MEMBER_COUNT, (msg) => {
      if (msg.data?.count != null) setMemberCount(msg.data.count);
    });

    channel.subscribe(SocketEvents.HOST_STATUS, (msg) => {
      setHostStatus(msg.data as HostStatusPayload);
    });

    channel.subscribe(SocketEvents.ROOM_ENDED, async (msg) => {
      const payload = msg.data as RoomEndedPayload;
      console.log(`[Ably] ROOM_ENDED: ${payload.reason}`);
      await audioEngine.unload();
      onRoomEnded(payload.reason);
    });

    // Track Ably connection state
    channel.attach().then(() => setIsConnected(true)).catch(() => {});

    // Notify when track ends — call REST endpoint
    audioEngine.setOnTrackEnded(() => {
      const song = currentSongRef.current;
      if (song) {
        console.log(`[Ably] Track ended: ${song.title} — notifying server`);
        fetch(`${getApiBaseUrl()}/api/playback/track-ended`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode: roomCode, songId: song.id }),
        }).catch(() => {});
      }
    });

    return () => {
      channel.unsubscribe();
      channel.detach().catch(() => {});
      audioEngine.unload();
    };
  }, [initialRoom.code, initialRoom.id, onRoomEnded, performClockSync]);

  // ─────────────────────────────────────────────────────────────────
  // Host action handlers — all call REST endpoints, Ably broadcasts
  // ─────────────────────────────────────────────────────────────────
  const callPlayback = useCallback(async (path: string, body: Record<string, any>) => {
    try {
      await fetch(`${getApiBaseUrl()}/api/playback/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: initialRoom.code, ...body }),
      });
    } catch (err) {
      console.error(`[Playback] ${path} failed:`, err);
    }
  }, [initialRoom.code]);

  const emitPlay = useCallback(
    (songId: string, offsetSeconds: number) => {
      if (!user.isHost) return;
      setPlaybackState('playing');
      callPlayback('play', { songId, offsetSeconds });
    },
    [user.isHost, callPlayback]
  );

  const emitPause = useCallback(
    (offsetSeconds: number) => {
      if (!user.isHost) return;
      setPlaybackState('paused');
      callPlayback('pause', { offsetSeconds });
    },
    [user.isHost, callPlayback]
  );

  const emitSeek = useCallback(
    (offsetSeconds: number) => {
      if (!user.isHost) return;
      callPlayback('seek', { offsetSeconds });
    },
    [user.isHost, callPlayback]
  );

  const emitSkip = useCallback(() => {
    if (!user.isHost) return;
    callPlayback('skip', {});
  }, [user.isHost, callPlayback]);

  const emitReorderQueue = useCallback(
    (orderedQueueItemIds: string[]) => {
      if (!user.isHost) return;
      callPlayback('reorder', { orderedQueueItemIds });
    },
    [user.isHost, callPlayback]
  );

  const emitRemoveFromQueue = useCallback(
    (queueItemId: string) => {
      if (!user.isHost) return;
      callPlayback('remove', { queueItemId });
    },
    [user.isHost, callPlayback]
  );

  const endParty = useCallback(() => {
    if (user.isHost) {
      callPlayback('end-room', {});
    }
    closeAbly();
  }, [user.isHost, callPlayback]);

  return {
    socket: null, // Kept for type compat — no longer Socket.io
    isConnected,
    currentSong,
    queue,
    memberCount,
    playbackState,
    hostStatus,
    clockOffset,
    latency,
    isSynced,
    driftReport,
    isLiveStreaming,
    setIsLiveStreaming: () => {},
    emitPlay,
    emitPause,
    emitSeek,
    emitSkip,
    emitReorderQueue,
    emitRemoveFromQueue,
    endParty,
  };
}
