// Shared types between Backend and Frontend for "Room" Synced Listening Party

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export interface Room {
  id: string;
  code: string;
  hostId: string;
  status: 'active' | 'grace_period' | 'ended';
  currentSongId: string | null;
  playbackState: PlaybackStatus;
  startedAt: number | null; // Server timestamp in milliseconds when playback was started/resumed
  offsetSeconds: number; // Offset in seconds within the song at startedAt
  createdAt: string;
}

export interface Song {
  id: string;
  roomId: string;
  uploaderId: string;
  storageUrl: string;
  storageKey: string;
  title: string;
  artist: string;
  duration: number; // Duration in seconds
  uploadedAt: string;
  artworkUrl?: string;
}

export interface QueueItem {
  id: string;
  roomId: string;
  songId: string;
  position: number;
  addedBy: string;
  addedAt: string;
  song: Song;
}

export interface RoomState {
  room: Room;
  currentSong: Song | null;
  queue: QueueItem[];
  hostConnected: boolean;
  gracePeriodEndsAt?: number;
  memberCount: number;
  serverTime: number;
}

export interface UserSession {
  userId: string;
  displayName: string;
  isHost: boolean;
}

// Clock Synchronization Payloads
export interface PingPayload {
  clientSentAt: number;
}

export interface PongPayload {
  clientSentAt: number;
  serverTime: number;
}

export interface ClockSyncResult {
  clockOffset: number; // Server Time = Date.now() + clockOffset
  roundTripLatency: number;
}

// Playback Socket Payloads
export interface PlayPayload {
  songId: string;
  offsetSeconds: number;
  startedAt: number; // Server timestamp
}

export interface PausePayload {
  offsetSeconds: number;
}

export interface SeekPayload {
  offsetSeconds: number;
  startedAt: number | null; // Server timestamp if currently playing, or null if paused
  playbackState?: PlaybackStatus;
}

export interface SyncPulsePayload {
  serverTime: number;
  playbackState: PlaybackStatus;
  startedAt: number | null;
  offsetSeconds: number;
  currentSongId: string | null;
}

export interface SongChangedPayload {
  currentSong: Song | null;
  startedAt: number | null;
  offsetSeconds: number;
  playbackState: PlaybackStatus;
}

export interface HostStatusPayload {
  isHostConnected: boolean;
  gracePeriodSeconds?: number;
  gracePeriodEndsAt?: number;
}

export interface RoomEndedPayload {
  reason: 'host_left' | 'host_ended' | 'grace_expired';
}

export interface RoomStateSyncPayload {
  queue: QueueItem[];
  currentSong: Song | null;
  playbackState: PlaybackStatus;
  startedAt: number | null;
  offsetSeconds: number;
}

// REST API Payloads
export interface CreateRoomRequest {
  displayName: string;
}

export interface CreateRoomResponse {
  room: Room;
  user: UserSession;
  token: string;
}

export interface JoinRoomRequest {
  code: string;
  displayName: string;
}

export interface JoinRoomResponse {
  room: Room;
  user: UserSession;
  token: string;
}

export interface PresignedUploadRequest {
  filename: string;
  contentType: string;
  fileSize?: number;
}

export interface PresignedUploadResponse {
  uploadUrl: string;
  storageKey: string;
  publicUrl: string;
}

export interface AddSongRequest {
  storageUrl: string;
  storageKey: string;
  title: string;
  artist: string;
  duration: number;
}

export interface YouTubeInfoRequest {
  url: string;
}

export interface YouTubeVideoInfo {
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
  youtubeUrl: string;
}

export interface YouTubeInfoResponse {
  info: YouTubeVideoInfo;
}

export interface AddYouTubeSongRequest {
  url: string;
  title?: string;
  artist?: string;
}

// Socket Events enum
export enum SocketEvents {
  // Clock sync
  PING = 'sync:ping',
  PONG = 'sync:pong',

  // Room lifecycle
  JOIN_ROOM = 'room:join',
  LEAVE_ROOM = 'room:leave',
  ROOM_STATE = 'room:state',
  ROOM_STATE_SYNC = 'room:state-sync',
  ROOM_ENDED = 'room:ended',
  HOST_STATUS = 'room:host-status',
  MEMBER_COUNT = 'room:member-count',

  // Playback control
  PLAY = 'playback:play',
  PAUSE = 'playback:pause',
  SEEK = 'playback:seek',
  SKIP = 'playback:skip',
  SONG_CHANGED = 'playback:song-changed',
  SYNC_PULSE = 'playback:sync-pulse',
  TRACK_ENDED = 'playback:track-ended',

  // Queue
  QUEUE_UPDATED = 'queue:updated',
  REORDER_QUEUE = 'queue:reorder',
  REMOVE_FROM_QUEUE = 'queue:remove',
}
