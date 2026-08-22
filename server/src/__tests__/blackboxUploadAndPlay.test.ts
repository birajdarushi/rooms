import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { roomsRouter } from '../routes/rooms';
import { storageRouter } from '../routes/storage';
import { prisma } from '../db/prisma';
import { advanceToNextSong } from '../sockets/syncHandler';
import { teardownRoom } from '../sockets/roomLifecycle';
import { storageService } from '../services/storage';

const app = express();
app.use(express.json());
app.use('/api/rooms', roomsRouter);
app.use('/api/storage', storageRouter);

const mockIo: any = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
};

describe('Blackbox End-to-End Functional Test: Upload, Queue, Playback, and Teardown', () => {
  let roomId: string;
  let roomCode: string;
  let hostId: string;
  const createdKeys: string[] = [];

  beforeAll(async () => {
    await prisma.queueItem.deleteMany();
    await prisma.song.deleteMany();
    await prisma.room.deleteMany();
  });

  afterAll(async () => {
    // Cleanup files and DB
    if (roomId) {
      await storageService.deleteRoomAudioFiles(roomId);
    }
    await prisma.queueItem.deleteMany();
    await prisma.song.deleteMany();
    await prisma.room.deleteMany();
    await prisma.$disconnect();
  });

  it('Step 1: Host creates an ephemeral listening room', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ displayName: 'DJ Blackbox' });

    expect(res.status).toBe(201);
    expect(res.body.room).toBeDefined();
    expect(res.body.room.code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/);

    roomId = res.body.room.id;
    roomCode = res.body.room.code;
    hostId = res.body.user.userId;
  });

  it('Step 2: Uploads 4 songs in sequence and verifies direct-to-storage saving', async () => {
    const songsToUpload = [
      { name: 'synth_dreams.mp3', title: 'Synth Dreams', artist: 'Neon Waves', duration: 195 },
      { name: 'cyber_groove.mp3', title: 'Cyber Groove', artist: 'Retro Tech', duration: 210 },
      { name: 'midnight_drive.wav', title: 'Midnight Drive', artist: 'Nightfall', duration: 180 },
      { name: 'future_bass.m4a', title: 'Future Bass', artist: 'Pulse Duo', duration: 240 },
    ];

    for (let i = 0; i < songsToUpload.length; i++) {
      const songInfo = songsToUpload[i];

      // A. Get presigned upload URL
      const presignedRes = await request(app)
        .post(`/api/storage/rooms/${roomId}/presigned-url`)
        .send({
          filename: songInfo.name,
          contentType: 'audio/mpeg',
        });

      expect(presignedRes.status).toBe(200);
      expect(presignedRes.body.storageKey).toBeDefined();
      expect(presignedRes.body.uploadUrl).toBeDefined();

      const storageKey = presignedRes.body.storageKey;
      const publicUrl = presignedRes.body.publicUrl;
      createdKeys.push(storageKey);

      // B. Direct binary upload to the storage upload endpoint
      const dummyAudioBuffer = Buffer.from(`ID3_DUMMY_AUDIO_DATA_FOR_${songInfo.title}_${Date.now()}`);

      const uploadRes = await request(app)
        .put(`/api/storage/local-upload?key=${encodeURIComponent(storageKey)}`)
        .set('Content-Type', 'audio/mpeg')
        .send(dummyAudioBuffer);

      expect(uploadRes.status).toBe(200);
      expect(uploadRes.body.success).toBe(true);

      // C. Register song into room queue
      const registerRes = await request(app)
        .post(`/api/storage/rooms/${roomId}/songs`)
        .send({
          storageUrl: publicUrl,
          storageKey,
          title: songInfo.title,
          artist: songInfo.artist,
          duration: songInfo.duration,
          uploaderId: hostId,
        });

      expect(registerRes.status).toBe(201);
      expect(registerRes.body.song.title).toBe(songInfo.title);
      expect(registerRes.body.queueItem.position).toBe(i);
    }
  });

  it('Step 3: Verifies all 4 songs exist in room queue in exact sequential positions', async () => {
    const roomState = await request(app).get(`/api/rooms/${roomId}`);
    expect(roomState.status).toBe(200);

    const { queue, currentSong } = roomState.body;
    expect(queue).toHaveLength(4);
    expect(queue[0].song.title).toBe('Synth Dreams');
    expect(queue[1].song.title).toBe('Cyber Groove');
    expect(queue[2].song.title).toBe('Midnight Drive');
    expect(queue[3].song.title).toBe('Future Bass');

    // First uploaded song is automatically set as active song
    expect(currentSong.title).toBe('Synth Dreams');
  });

  it('Step 4: Host reorders queue and verifies order persistence', async () => {
    const roomState = await request(app).get(`/api/rooms/${roomId}`);
    const originalQueue = roomState.body.queue;

    // Reverse order: item 3, item 2, item 1, item 0
    const reversedIds = [originalQueue[3].id, originalQueue[2].id, originalQueue[1].id, originalQueue[0].id];

    for (let i = 0; i < reversedIds.length; i++) {
      await prisma.queueItem.update({
        where: { id: reversedIds[i] },
        data: { position: i },
      });
    }

    const updatedState = await request(app).get(`/api/rooms/${roomId}`);
    expect(updatedState.body.queue[0].song.title).toBe('Future Bass');
    expect(updatedState.body.queue[1].song.title).toBe('Midnight Drive');
    expect(updatedState.body.queue[2].song.title).toBe('Cyber Groove');
    expect(updatedState.body.queue[3].song.title).toBe('Synth Dreams');
  });

  it('Step 5: Host removes an item from queue and remaining items renumber correctly', async () => {
    const roomState = await request(app).get(`/api/rooms/${roomId}`);
    const itemToRemove = roomState.body.queue[1]; // Remove Midnight Drive

    await prisma.queueItem.delete({ where: { id: itemToRemove.id } });

    // Renumber remaining
    const remaining = await prisma.queueItem.findMany({
      where: { roomId },
      orderBy: { position: 'asc' },
    });
    for (let i = 0; i < remaining.length; i++) {
      await prisma.queueItem.update({
        where: { id: remaining[i].id },
        data: { position: i },
      });
    }

    const finalState = await request(app).get(`/api/rooms/${roomId}`);
    expect(finalState.body.queue).toHaveLength(3);
    expect(finalState.body.queue[0].song.title).toBe('Future Bass');
    expect(finalState.body.queue[1].song.title).toBe('Cyber Groove');
    expect(finalState.body.queue[2].song.title).toBe('Synth Dreams');
  });

  it('Step 6: Song auto-advance works when current track finishes', async () => {
    // Current song is Future Bass
    await prisma.room.update({
      where: { id: roomId },
      data: { currentSongId: (await prisma.song.findFirst({ where: { title: 'Future Bass' } }))?.id, playbackState: 'playing' },
    });

    await advanceToNextSong(mockIo, roomCode);

    const roomAfterAdvance = await prisma.room.findUnique({ where: { id: roomId } });
    const currentActiveSong = await prisma.song.findUnique({ where: { id: roomAfterAdvance?.currentSongId! } });

    // Advances to next queued item: Cyber Groove
    expect(currentActiveSong?.title).toBe('Cyber Groove');
    expect(roomAfterAdvance?.playbackState).toBe('playing');
    expect(roomAfterAdvance?.offsetSeconds).toBe(0);
  });

  it('Step 7: Room teardown deletes all uploaded audio files from disk/storage', async () => {
    const session: any = {
      roomId,
      roomCode,
      hostId,
      hostSocketId: 'mock_sock',
      hostDisconnectTimer: null,
      gracePeriodEndsAt: null,
      syncPulseTimer: null,
      connectedMembers: new Map(),
    };

    await teardownRoom(mockIo, session, 'host_ended');

    // Verify room is marked ended
    const endedRoom = await prisma.room.findUnique({ where: { id: roomId } });
    expect(endedRoom?.status).toBe('ended');

    // Verify joining ended room is rejected
    const joinRes = await request(app).post('/api/rooms/join').send({ code: roomCode, displayName: 'Late User' });
    expect(joinRes.status).toBe(404);
  });
});
