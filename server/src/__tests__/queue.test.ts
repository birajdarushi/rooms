import request from 'supertest';
import express from 'express';
import { roomsRouter } from '../routes/rooms';
import { storageRouter } from '../routes/storage';
import { prisma } from '../db/prisma';
import { advanceToNextSong } from '../sockets/syncHandler';

const app = express();
app.use(express.json());
app.use('/api/rooms', roomsRouter);
app.use('/api/storage', storageRouter);

// Mock socket.io server
const mockIo: any = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
};

describe('Backend: Queue Logic & Auto-Advance', () => {
  let roomId: string;
  let roomCode: string;

  beforeEach(async () => {
    await prisma.queueItem.deleteMany();
    await prisma.song.deleteMany();
    await prisma.room.deleteMany();

    const roomRes = await request(app).post('/api/rooms').send({ displayName: 'Queue Host' });
    roomId = roomRes.body.room.id;
    roomCode = roomRes.body.room.code;
  });

  afterAll(async () => {
    await prisma.queueItem.deleteMany();
    await prisma.song.deleteMany();
    await prisma.room.deleteMany();
    await prisma.$disconnect();
  });

  it('adds songs to the room queue with sequential positions (0, 1, 2)', async () => {
    const song1Res = await request(app)
      .post(`/api/storage/rooms/${roomId}/songs`)
      .send({
        storageUrl: 'https://cdn.test/song1.mp3',
        storageKey: 'rooms/r1/song1.mp3',
        title: 'Song 1',
        artist: 'Artist 1',
        duration: 180,
      });

    expect(song1Res.status).toBe(201);
    expect(song1Res.body.queueItem.position).toBe(0);

    const song2Res = await request(app)
      .post(`/api/storage/rooms/${roomId}/songs`)
      .send({
        storageUrl: 'https://cdn.test/song2.mp3',
        storageKey: 'rooms/r1/song2.mp3',
        title: 'Song 2',
        artist: 'Artist 2',
        duration: 210,
      });

    expect(song2Res.status).toBe(201);
    expect(song2Res.body.queueItem.position).toBe(1);

    // Verify room state has 2 queue items
    const roomState = await request(app).get(`/api/rooms/${roomId}`);
    expect(roomState.body.queue).toHaveLength(2);
    expect(roomState.body.currentSong.title).toBe('Song 1');
  });

  it('auto-advances to next song in queue when current song ends', async () => {
    // Add Song A and Song B
    const s1 = await request(app).post(`/api/storage/rooms/${roomId}/songs`).send({
      storageUrl: 'https://cdn.test/songA.mp3',
      storageKey: 'rooms/r1/sA.mp3',
      title: 'Track A',
      artist: 'Artist A',
      duration: 120,
    });
    const s2 = await request(app).post(`/api/storage/rooms/${roomId}/songs`).send({
      storageUrl: 'https://cdn.test/songB.mp3',
      storageKey: 'rooms/r1/sB.mp3',
      title: 'Track B',
      artist: 'Artist B',
      duration: 150,
    });

    const song1Id = s1.body.song.id;
    const song2Id = s2.body.song.id;

    // Set playing song 1
    await prisma.room.update({
      where: { id: roomId },
      data: { currentSongId: song1Id, playbackState: 'playing' },
    });

    // Advance to next song
    await advanceToNextSong(mockIo, roomCode);

    const updatedRoom = await prisma.room.findUnique({ where: { id: roomId } });
    expect(updatedRoom?.currentSongId).toBe(song2Id);
    expect(updatedRoom?.playbackState).toBe('playing');
    expect(updatedRoom?.offsetSeconds).toBe(0);
    expect(updatedRoom?.startedAt).not.toBeNull();
    expect(mockIo.to).toHaveBeenCalledWith(roomCode);
  });

  it('gracefully handles queue empty-out when the last song ends (sets idle, currentSongId = null)', async () => {
    // Add single song
    const s1 = await request(app).post(`/api/storage/rooms/${roomId}/songs`).send({
      storageUrl: 'https://cdn.test/onlySong.mp3',
      storageKey: 'rooms/r1/only.mp3',
      title: 'Final Track',
      artist: 'Solo Artist',
      duration: 90,
    });

    // Advance past the last song
    await advanceToNextSong(mockIo, roomCode);

    const updatedRoom = await prisma.room.findUnique({ where: { id: roomId } });
    expect(updatedRoom?.currentSongId).toBeFalsy();
    expect(updatedRoom?.playbackState).toBe('idle');
    expect(updatedRoom?.startedAt).toBeFalsy();
  });
});
