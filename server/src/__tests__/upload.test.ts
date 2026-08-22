import request from 'supertest';
import express from 'express';
import { roomsRouter } from '../routes/rooms';
import { storageRouter } from '../routes/storage';
import { prisma } from '../db/prisma';
import { storageService } from '../services/storage';

const app = express();
app.use(express.json());
app.use('/api/rooms', roomsRouter);
app.use('/api/storage', storageRouter);

describe('Backend: Direct-to-Storage Upload Flow', () => {
  let roomId: string;

  beforeAll(async () => {
    await prisma.queueItem.deleteMany();
    await prisma.song.deleteMany();
    await prisma.room.deleteMany();

    const roomRes = await request(app).post('/api/rooms').send({ displayName: 'Upload Host' });
    roomId = roomRes.body.room.id;
  });

  afterAll(async () => {
    await prisma.queueItem.deleteMany();
    await prisma.song.deleteMany();
    await prisma.room.deleteMany();
    await prisma.$disconnect();
  });

  it('generates a valid, room-scoped upload URL and storage key', async () => {
    const res = await request(app)
      .post(`/api/storage/rooms/${roomId}/presigned-url`)
      .send({
        filename: 'my_song.mp3',
        contentType: 'audio/mpeg',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('uploadUrl');
    expect(res.body).toHaveProperty('storageKey');
    expect(res.body).toHaveProperty('publicUrl');
    expect(res.body.storageKey).toContain(`rooms/${roomId}/`);
    expect(res.body.storageKey).toContain('my_song.mp3');
  });

  it('rejects presigned URL generation for non-existent room', async () => {
    const res = await request(app)
      .post('/api/storage/rooms/fake-room-id/presigned-url')
      .send({ filename: 'track.mp3', contentType: 'audio/mpeg' });

    expect(res.status).toBe(404);
  });

  it('persists song metadata correctly upon registration', async () => {
    const songData = {
      storageUrl: 'https://storage.room.app/rooms/r1/audio.mp3',
      storageKey: 'rooms/r1/audio.mp3',
      title: 'Neon Horizon',
      artist: 'Synthwave Duo',
      duration: 245.5,
    };

    const res = await request(app)
      .post(`/api/storage/rooms/${roomId}/songs`)
      .send(songData);

    expect(res.status).toBe(201);
    expect(res.body.song.title).toBe('Neon Horizon');
    expect(res.body.song.artist).toBe('Synthwave Duo');
    expect(res.body.song.duration).toBe(245.5);

    // Verify in database
    const savedSong = await prisma.song.findUnique({ where: { id: res.body.song.id } });
    expect(savedSong).not.toBeNull();
    expect(savedSong?.title).toBe('Neon Horizon');
  });
});
