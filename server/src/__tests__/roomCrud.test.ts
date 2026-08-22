import request from 'supertest';
import express from 'express';
import { roomsRouter } from '../routes/rooms';
import { prisma } from '../db/prisma';

const app = express();
app.use(express.json());
app.use('/api/rooms', roomsRouter);

describe('Backend: Room CRUD & Codes', () => {
  beforeAll(async () => {
    // Clear any test data
    await prisma.queueItem.deleteMany();
    await prisma.song.deleteMany();
    await prisma.room.deleteMany();
  });

  afterAll(async () => {
    await prisma.queueItem.deleteMany();
    await prisma.song.deleteMany();
    await prisma.room.deleteMany();
    await prisma.$disconnect();
  });

  it('creating a room generates a unique 5-character alphanumeric code and sets host', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ displayName: 'DJ Test' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('room');
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('token');

    const { room, user } = res.body;
    expect(room.code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/);
    expect(room.hostId).toBe(user.userId);
    expect(user.isHost).toBe(true);
    expect(user.displayName).toBe('DJ Test');
    expect(room.status).toBe('active');
    expect(room.playbackState).toBe('idle');
  });

  it('joining with a valid room code succeeds and returns room state', async () => {
    // Create room first
    const createRes = await request(app)
      .post('/api/rooms')
      .send({ displayName: 'Host 1' });
    const code = createRes.body.room.code;

    // Join room
    const joinRes = await request(app)
      .post('/api/rooms/join')
      .send({ code, displayName: 'Joiner 1' });

    expect(joinRes.status).toBe(200);
    expect(joinRes.body.room.code).toBe(code);
    expect(joinRes.body.user.isHost).toBe(false);
    expect(joinRes.body.user.displayName).toBe('Joiner 1');
  });

  it('joining with an invalid / non-existent code fails with 404', async () => {
    const res = await request(app)
      .post('/api/rooms/join')
      .send({ code: 'NONEXISTENT', displayName: 'Joiner' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('joining an already-ended room fails with 404 error', async () => {
    // Create room
    const createRes = await request(app)
      .post('/api/rooms')
      .send({ displayName: 'Host Ended' });
    const roomId = createRes.body.room.id;
    const code = createRes.body.room.code;

    // Mark room ended in DB
    await prisma.room.update({
      where: { id: roomId },
      data: { status: 'ended' },
    });

    const joinRes = await request(app)
      .post('/api/rooms/join')
      .send({ code, displayName: 'Late Joiner' });

    expect(joinRes.status).toBe(404);
    expect(joinRes.body.error).toContain('ended');
  });
});
