import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  CreateRoomResponse,
  JoinRoomResponse,
  PresignedUploadResponse,
  RoomState,
  AddSongRequest,
  Song,
  QueueItem,
} from '../types';

const FALLBACK_LAN_IP = '192.168.31.249';
const PRODUCTION_API_URL = 'https://server-lilac-beta-70.vercel.app';

/**
 * Auto-detect the backend URL for physical mobile devices (Expo Go / browser)
 * and production deployments (Cloudflare Pages / Vercel).
 */
function detectApiBaseUrl(): string {
  // 0. Explicit environment variable if provided during build
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  }

  // 1. If running on public domain (Cloudflare Pages / Vercel), use production HTTPS backend
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    if (hostname.includes('birajdar.in') || hostname.includes('pages.dev') || hostname.includes('vercel.app')) {
      return PRODUCTION_API_URL;
    }
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${hostname}:4000`;
    }
  }

  // 2. On Expo Go / Native App, inspect hostUri from Metro bundler
  try {
    const hostUri: string | undefined =
      Constants.expoConfig?.hostUri ??
      (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ??
      (Constants as any).manifest?.debuggerHost;

    if (hostUri) {
      const ip = hostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        return `http://${ip}:4000`;
      }
    }
  } catch (_) {}

  // 3. Fallback for physical devices on same Wi-Fi
  return `http://${FALLBACK_LAN_IP}:4000`;
}

let apiBaseUrl = detectApiBaseUrl();

export function setApiBaseUrl(url: string) {
  apiBaseUrl = url.replace(/\/$/, '');
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export const api = {
  async createRoom(displayName: string): Promise<CreateRoomResponse> {
    const res = await fetch(`${apiBaseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create room');
    }
    return res.json();
  },

  async joinRoom(code: string, displayName: string): Promise<JoinRoomResponse> {
    const res = await fetch(`${apiBaseUrl}/api/rooms/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.toUpperCase(), displayName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to join room. Check code and try again.');
    }
    return res.json();
  },

  async getRoomState(roomId: string): Promise<RoomState> {
    const res = await fetch(`${apiBaseUrl}/api/rooms/${roomId}`);
    if (!res.ok) {
      throw new Error('Failed to fetch room state');
    }
    return res.json();
  },

  async getPresignedUploadUrl(
    roomId: string,
    filename: string,
    contentType: string,
    fileSizeBytes?: number
  ): Promise<PresignedUploadResponse> {
    // Try primary upload-url endpoint
    try {
      const res = await fetch(`${apiBaseUrl}/api/storage/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, filename, mimeType: contentType, contentType, fileSizeBytes }),
      });
      if (res.ok) return res.json();
    } catch (_) {}

    // Fallback to rooms/:id/presigned-url endpoint
    const res = await fetch(`${apiBaseUrl}/api/storage/rooms/${roomId}/presigned-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, contentType }),
    });
    if (!res.ok) {
      throw new Error('Failed to get presigned upload URL');
    }
    return res.json();
  },

  async uploadToStorage(uploadUrl: string, fileOrUri: any, contentType: string): Promise<void> {
    if (Platform.OS === 'web') {
      let body: any = fileOrUri;

      // If fileOrUri is a string URI (e.g. blob:http... or data:...)
      if (typeof fileOrUri === 'string') {
        if (fileOrUri.startsWith('blob:') || fileOrUri.startsWith('data:')) {
          const blobRes = await fetch(fileOrUri);
          body = await blobRes.blob();
        }
      } else if (fileOrUri && fileOrUri.file) {
        // DocumentPicker on web might wrap File in asset.file
        body = fileOrUri.file;
      }

      console.log('[Storage] Uploading audio binary to storage:', typeof body, body?.size || 'unknown size');

      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType || 'audio/mpeg' },
        body: body,
      });

      if (!res.ok) {
        throw new Error(`Direct storage upload failed: ${res.statusText}`);
      }
    } else {
      const FileSystem = require('expo-file-system');
      const uri = typeof fileOrUri === 'string' ? fileOrUri : (fileOrUri.uri || fileOrUri);
      const uploadTask = await FileSystem.uploadAsync(uploadUrl, uri, {
        httpMethod: 'PUT',
        headers: { 'Content-Type': contentType },
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });
      if (uploadTask.status < 200 || uploadTask.status >= 300) {
        throw new Error(`Direct storage upload failed with status ${uploadTask.status}`);
      }
    }
  },

  async registerSong(
    roomId: string,
    data: {
      storageUrl: string;
      storageKey: string;
      title: string;
      artist?: string;
      duration?: number;
      uploaderId?: string;
    }
  ): Promise<{ song: Song; queueItem: QueueItem }> {
    const payload = {
      roomId,
      storageUrl: data.storageUrl,
      storageKey: data.storageKey,
      title: data.title,
      artist: data.artist || 'Unknown Artist',
      duration: data.duration || 0,
      uploaderId: data.uploaderId || 'host',
    };

    // Try /register-song alias
    try {
      const res = await fetch(`${apiBaseUrl}/api/storage/register-song`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) return res.json();
    } catch (_) {}

    // Fallback to /rooms/:id/songs endpoint
    const res = await fetch(`${apiBaseUrl}/api/storage/rooms/${roomId}/songs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error('Failed to register song with room');
    }
    return res.json();
  },

  async addSong(roomId: string, req: AddSongRequest): Promise<{ song: Song; queueItem: QueueItem }> {
    return this.registerSong(roomId, req);
  },

  async getYoutubeInfo(url: string): Promise<any> {
    const res = await fetch(`${apiBaseUrl}/api/youtube/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch YouTube info');
    }
    const data = await res.json();
    return data.info;
  },

  async addYoutubeSong(
    roomId: string,
    data: { url: string; title?: string; artist?: string; uploaderId?: string }
  ): Promise<{ song: Song; queueItem: QueueItem }> {
    const res = await fetch(`${apiBaseUrl}/api/youtube/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId,
        url: data.url,
        title: data.title,
        artist: data.artist,
        uploaderId: data.uploaderId || 'host',
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to add YouTube track to room queue');
    }
    return res.json();
  },

  async getSpotifyInfo(url: string): Promise<any> {
    const res = await fetch(`${apiBaseUrl}/api/spotify/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch Spotify track info');
    }
    const data = await res.json();
    return data.info;
  },

  async addSpotifySong(
    roomId: string,
    data: { url: string; title?: string; artist?: string; uploaderId?: string }
  ): Promise<{ song: Song; queueItem: QueueItem }> {
    const res = await fetch(`${apiBaseUrl}/api/spotify/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId,
        url: data.url,
        title: data.title,
        artist: data.artist,
        uploaderId: data.uploaderId || 'host',
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to add Spotify track to room queue');
    }
    return res.json();
  },
};
