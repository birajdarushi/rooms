import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
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
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [memberCount, setMemberCount] = useState<number>(1);
  const [playbackState, setPlaybackState] = useState<PlaybackStatus>(initialRoom.playbackState);
  const [hostStatus, setHostStatus] = useState<HostStatusPayload>({ isHostConnected: true });
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const { clockOffset, latency, isSynced, driftReport, performClockSync } = useSyncEngine(
    socket,
    currentSong
  );

  const socketRef = useRef<Socket | null>(null);
  const roomRef = useRef<Room>(initialRoom);
  const userRef = useRef<UserSession>(user);
  const currentSongRef = useRef<Song | null>(null);

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  // Initialize Socket connection
  useEffect(() => {
    const serverUrl = getApiBaseUrl();
    const newSocket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', async () => {
      console.log(`[Socket] Connected to ${serverUrl} as ${user.displayName}`);
      setIsConnected(true);

      // Perform clock offset calculation
      const computedOffset = await performClockSync(newSocket);

      // Join room channel
      newSocket.emit(SocketEvents.JOIN_ROOM, {
        roomCode: initialRoom.code,
        userId: user.userId,
        displayName: user.displayName,
        isHost: user.isHost,
      });

      // If mid-song when joining, compute initial seek position and resume playback
      if (initialRoom.currentSongId && initialRoom.playbackState === 'playing' && initialRoom.startedAt) {
        const { targetPosition } = calculateTargetPosition({
          startedAt: initialRoom.startedAt,
          offsetSeconds: initialRoom.offsetSeconds,
          clockOffset: computedOffset,
        });
        console.log(`[Socket] Late-join mid-song detected: target position = ${targetPosition.toFixed(2)}s`);
      }
    });

    newSocket.on('disconnect', () => {
      console.log('[Socket] Disconnected from server');
      setIsConnected(false);
    });

    // 1. Queue Updates (broadcast to all — triggered by new uploads)
    newSocket.on(SocketEvents.QUEUE_UPDATED, (payload: { queue: QueueItem[] }) => {
      console.log(`[Socket] Queue updated broadcast: ${payload.queue.length} songs`);
      setQueue(payload.queue);
    });

    // 1b. Room State Sync (sent only to THIS socket right after joining)
    // Contains the full current state: existing queue, current song, playback state
    newSocket.on(SocketEvents.ROOM_STATE_SYNC, async (payload: RoomStateSyncPayload) => {
      console.log(`[Socket] Room state sync received: queue=${payload.queue.length} songs, currentSong=${payload.currentSong?.title || 'none'}, state=${payload.playbackState}`);
      setQueue(payload.queue);
      setPlaybackState(payload.playbackState);

      if (payload.currentSong) {
        setCurrentSong(payload.currentSong);
        const isPlaying = payload.playbackState === 'playing';
        const targetPos = calculateTargetPosition({
          startedAt: payload.startedAt,
          offsetSeconds: payload.offsetSeconds,
          clockOffset: 0,
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
      }
    });

    // 2. Song Changed / Auto-advance
    newSocket.on(SocketEvents.SONG_CHANGED, async (payload: SongChangedPayload) => {
      console.log(`[Socket] Song changed:`, payload.currentSong?.title || 'None');
      setCurrentSong(payload.currentSong);
      setPlaybackState(payload.playbackState);

      if (payload.currentSong) {
        const isPlaying = payload.playbackState === 'playing';
        const targetPos = calculateTargetPosition({
          startedAt: payload.startedAt,
          offsetSeconds: payload.offsetSeconds,
          clockOffset: 0,
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

    // 2b. Playback State Events (for listeners and room UI synchronization)
    newSocket.on(SocketEvents.PLAY, (payload: PlayPayload) => {
      console.log('[Socket] Incoming PLAY event');
      setPlaybackState('playing');
    });

    newSocket.on(SocketEvents.PAUSE, (payload: PausePayload) => {
      console.log('[Socket] Incoming PAUSE event');
      setPlaybackState('paused');
    });

    newSocket.on(SocketEvents.SEEK, (payload: SeekPayload) => {
      console.log('[Socket] Incoming SEEK event to', payload.offsetSeconds, 'state:', payload.playbackState);
      if (payload.playbackState) {
        setPlaybackState(payload.playbackState);
      }
    });

    // 3. Member Count
    newSocket.on(SocketEvents.MEMBER_COUNT, (payload: { count: number }) => {
      setMemberCount(payload.count);
    });

    // 4. Host Status (Grace period timer)
    newSocket.on(SocketEvents.HOST_STATUS, (payload: HostStatusPayload) => {
      console.log(`[Socket] Host status update:`, payload);
      setHostStatus(payload);
    });

    // 5. Room Ended
    newSocket.on(SocketEvents.ROOM_ENDED, async (payload: RoomEndedPayload) => {
      console.log(`[Socket] Room ended by server: reason = ${payload.reason}`);
      await audioEngine.unload();
      onRoomEnded(payload.reason);
    });

    // Notify server when local track finishes
    audioEngine.setOnTrackEnded(() => {
      if (currentSongRef.current) {
        console.log(`[Socket] Local track ended for song: ${currentSongRef.current.title} (${currentSongRef.current.id}). Emitting TRACK_ENDED to server.`);
        newSocket.emit(SocketEvents.TRACK_ENDED, { songId: currentSongRef.current.id });
      }
    });

    return () => {
      newSocket.disconnect();
      audioEngine.unload();
    };
  }, [initialRoom.code, initialRoom.id, user.userId, user.displayName, user.isHost, onRoomEnded, performClockSync]);

  // Host Action Handlers
  const emitPlay = useCallback(
    (songId: string, offsetSeconds: number) => {
      if (!socketRef.current || !user.isHost) return;
      setPlaybackState('playing');
      socketRef.current.emit(SocketEvents.PLAY, { songId, offsetSeconds });
    },
    [user.isHost]
  );

  const emitPause = useCallback(
    (offsetSeconds: number) => {
      if (!socketRef.current || !user.isHost) return;
      setPlaybackState('paused');
      socketRef.current.emit(SocketEvents.PAUSE, { offsetSeconds });
    },
    [user.isHost]
  );

  const emitSeek = useCallback(
    (offsetSeconds: number) => {
      if (!socketRef.current || !user.isHost) return;
      socketRef.current.emit(SocketEvents.SEEK, { offsetSeconds });
    },
    [user.isHost]
  );

  const emitSkip = useCallback(() => {
    if (!socketRef.current || !user.isHost) return;
    socketRef.current.emit(SocketEvents.SKIP);
  }, [user.isHost]);

  const emitReorderQueue = useCallback(
    (orderedQueueItemIds: string[]) => {
      if (!socketRef.current || !user.isHost) return;
      socketRef.current.emit(SocketEvents.REORDER_QUEUE, { orderedQueueItemIds });
    },
    [user.isHost]
  );

  const emitRemoveFromQueue = useCallback(
    (queueItemId: string) => {
      if (!socketRef.current || !user.isHost) return;
      socketRef.current.emit(SocketEvents.REMOVE_FROM_QUEUE, { queueItemId });
    },
    [user.isHost]
  );

  const endParty = useCallback(() => {
    if (!socketRef.current) return;
    if (user.isHost) {
      socketRef.current.emit(SocketEvents.LEAVE_ROOM, { endRoom: true });
    } else {
      socketRef.current.emit(SocketEvents.LEAVE_ROOM, { endRoom: false });
    }
  }, [user.isHost]);

  return {
    socket,
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
    emitPlay,
    emitPause,
    emitSeek,
    emitSkip,
    emitReorderQueue,
    emitRemoveFromQueue,
    endParty,
  };
}
