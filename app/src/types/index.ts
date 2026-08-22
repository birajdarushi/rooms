// Types for "Room" Synced Listening Party

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export interface Room {
  id: string;
  code: string;
  hostId: string;
  status: 'active' | 'grace_period' | 'ended';
  currentSongId: string | null;
  playbackState: PlaybackStatus;
  startedAt: number | null;
  offsetSeconds: number;
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
  duration: number;
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
  clockOffset: number;
  roundTripLatency: number;
}

// Playback Socket Payloads
export interface PlayPayload {
  songId: string;
  offsetSeconds: number;
  startedAt: number;
}

export interface PausePayload {
  offsetSeconds: number;
}

export interface SeekPayload {
  offsetSeconds: number;
  startedAt: number | null;
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

export interface SpotifyInfoRequest {
  url: string;
}

export interface SpotifyTrackInfo {
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
  spotifyUrl: string;
  source: 'spotify';
}

export interface SpotifyInfoResponse {
  info: SpotifyTrackInfo;
}

export interface AddSpotifySongRequest {
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

  // Live System Audio Streaming & WebRTC Signaling
  STREAM_START = 'stream:start',
  STREAM_STARTED = 'stream:started',
  STREAM_STOP = 'stream:stop',
  STREAM_STOPPED = 'stream:stopped',
  STREAM_OFFER = 'stream:offer',
  STREAM_ANSWER = 'stream:answer',
  STREAM_ICE_CANDIDATE = 'stream:ice-candidate',
  STREAM_CHUNK = 'stream:chunk',
}

export interface StreamStartPayload {
  roomId: string;
  title?: string;
}

export interface StreamOfferPayload {
  roomId: string;
  targetSocketId: string;
  sdp: any;
}

export interface StreamAnswerPayload {
  roomId: string;
  targetSocketId: string;
  sdp: any;
}

export interface StreamIceCandidatePayload {
  roomId: string;
  targetSocketId: string;
  candidate: any;
}

export interface StreamChunkPayload {
  roomId: string;
  chunk: string;
  timestamp: number;
}

export interface AudioTrackInfo {
  id: string;
  url: string;
  title: string;
  artist: string;
  duration: number;
  artwork?: string;
}

export interface PlayerStatus {
  isPlaying: boolean;
  position: number;
  duration: number;
  isLoading: boolean;
  isBuffering: boolean;
}

export interface DriftReport {
  driftMs: number;
  expectedSec: number;
  actualSec: number;
  lastPulseAt: number;
  reseekTriggered: boolean;
}
