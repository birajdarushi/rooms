import { PrismaClient } from '@prisma/client';
import { Room, Song, QueueItem } from '../shared';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Helper to convert Prisma Room model (with BigInt startedAt) into shared Room interface
export function formatRoom(room: any): Room {
  return {
    id: room.id,
    code: room.code,
    hostId: room.hostId,
    status: room.status as 'active' | 'grace_period' | 'ended',
    currentSongId: room.currentSongId,
    playbackState: room.playbackState as 'idle' | 'playing' | 'paused',
    startedAt: room.startedAt !== null && room.startedAt !== undefined ? Number(room.startedAt) : null,
    offsetSeconds: typeof room.offsetSeconds === 'number' ? room.offsetSeconds : 0,
    createdAt: room.createdAt instanceof Date ? room.createdAt.toISOString() : room.createdAt,
  };
}

export function formatSong(song: any): Song {
  return {
    id: song.id,
    roomId: song.roomId,
    uploaderId: song.uploaderId,
    storageUrl: song.storageUrl,
    storageKey: song.storageKey,
    title: song.title,
    artist: song.artist,
    duration: typeof song.duration === 'number' ? song.duration : 0,
    artworkUrl: song.artworkUrl || undefined,
    uploadedAt: song.uploadedAt instanceof Date ? song.uploadedAt.toISOString() : song.uploadedAt,
  };
}

export function formatQueueItem(item: any): QueueItem {
  const song: Song = item.song
    ? formatSong(item.song)
    : {
        id: item.songId || 'unknown',
        roomId: item.roomId,
        uploaderId: item.addedBy || 'unknown',
        storageUrl: '',
        storageKey: '',
        title: 'Untitled Track',
        artist: 'Unknown Artist',
        duration: 0,
        uploadedAt: new Date().toISOString(),
      };

  return {
    id: item.id,
    roomId: item.roomId,
    songId: item.songId,
    position: item.position,
    addedBy: item.addedBy,
    addedAt: item.addedAt instanceof Date ? item.addedAt.toISOString() : item.addedAt,
    song,
  };
}
