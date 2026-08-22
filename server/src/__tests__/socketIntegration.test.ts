import http from 'http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { prisma } from '../db/prisma';
import { registerRoomLifecycle } from '../sockets/roomLifecycle';
import { registerSyncAndPlaybackHandlers, setSocketServer } from '../sockets/syncHandler';
import { roomsRouter } from '../routes/rooms';
import { SocketEvents, PlayPayload, PausePayload, SeekPayload } from '../../../shared';

describe('Integration: In-Process Socket.io Room Sync & Broadcasts', () => {
  let server: http.Server;
  let ioServer: SocketIOServer;
  let port: number;
  let serverUrl: string;

  let roomId: string;
  let roomCode: string;
  let hostId: string;

  let hostSocket: ClientSocketType;
  let joinerSocket1: ClientSocketType;
  let joinerSocket2: ClientSocketType;

  beforeAll(async () => {
    // Setup Express + HTTP + Socket.io test server on ephemeral port
    const app = express();
    app.use(express.json());
    app.use('/api/rooms', roomsRouter);

    server = http.createServer(app);
    ioServer = new SocketIOServer(server, { cors: { origin: '*' } });
    setSocketServer(ioServer);

    ioServer.on('connection', (socket) => {
      registerRoomLifecycle(ioServer, socket);
      registerSyncAndPlaybackHandlers(ioServer, socket);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr: any = server.address();
        port = addr.port;
        serverUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // Create a room in DB
    const room = await prisma.room.create({
      data: {
        code: 'SYNC99',
        hostId: 'host_integration_user',
        status: 'active',
      },
    });
    roomId = room.id;
    roomCode = room.code;
    hostId = room.hostId;
  });

  afterAll(async () => {
    if (hostSocket?.connected) hostSocket.disconnect();
    if (joinerSocket1?.connected) joinerSocket1.disconnect();
    if (joinerSocket2?.connected) joinerSocket2.disconnect();

    ioServer.close();
    await new Promise((r) => server.close(r));
    await prisma.queueItem.deleteMany();
    await prisma.song.deleteMany();
    await prisma.room.deleteMany();
    await prisma.$disconnect();
  });

  it('connects host and joiners and establishes ping/pong clock synchronization', async () => {
    // Connect Host
    hostSocket = ClientSocket(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve) => hostSocket.on('connect', () => resolve()));

    // Ping-Pong test
    const pingSentAt = Date.now();
    const pongPromise = new Promise<{ clientSentAt: number; serverTime: number }>((resolve) => {
      hostSocket.on(SocketEvents.PONG, (data) => resolve(data));
    });
    hostSocket.emit(SocketEvents.PING, { clientSentAt: pingSentAt });
    const pong = await pongPromise;

    expect(pong.clientSentAt).toBe(pingSentAt);
    expect(pong.serverTime).toBeGreaterThanOrEqual(pingSentAt);

    // Host joins room
    hostSocket.emit(SocketEvents.JOIN_ROOM, {
      roomCode,
      userId: hostId,
      displayName: 'Party Host',
      isHost: true,
    });

    // Connect Joiner 1
    joinerSocket1 = ClientSocket(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve) => joinerSocket1.on('connect', () => resolve()));
    joinerSocket1.emit(SocketEvents.JOIN_ROOM, {
      roomCode,
      userId: 'joiner_1',
      displayName: 'Alice',
      isHost: false,
    });

    // Connect Joiner 2
    joinerSocket2 = ClientSocket(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve) => joinerSocket2.on('connect', () => resolve()));
    joinerSocket2.emit(SocketEvents.JOIN_ROOM, {
      roomCode,
      userId: 'joiner_2',
      displayName: 'Bob',
      isHost: false,
    });

    // Wait for room joining
    await new Promise((r) => setTimeout(r, 100));
  });

  it('broadcasts play event from host to all joiners with identical payload', async () => {
    const playDataPromise1 = new Promise<PlayPayload>((resolve) => {
      joinerSocket1.once(SocketEvents.PLAY, (data) => resolve(data));
    });
    const playDataPromise2 = new Promise<PlayPayload>((resolve) => {
      joinerSocket2.once(SocketEvents.PLAY, (data) => resolve(data));
    });

    // Host emits play
    hostSocket.emit(SocketEvents.PLAY, { songId: 'song_test_id', offsetSeconds: 12.5 });

    const [received1, received2] = await Promise.all([playDataPromise1, playDataPromise2]);

    // Check payload structure
    expect(received1.songId).toBe('song_test_id');
    expect(received1.offsetSeconds).toBe(12.5);
    expect(received1.startedAt).toBeDefined();

    // Check multi-client broadcast parity
    expect(received1).toEqual(received2);
  });

  it('broadcasts pause and seek actions accurately across room members', async () => {
    // 1. Pause broadcast
    const pausePromise = new Promise<PausePayload>((resolve) => {
      joinerSocket1.once(SocketEvents.PAUSE, (data) => resolve(data));
    });
    hostSocket.emit(SocketEvents.PAUSE, { offsetSeconds: 45.0 });
    const pauseData = await pausePromise;
    expect(pauseData.offsetSeconds).toBe(45.0);

    // 2. Seek broadcast
    const seekPromise = new Promise<SeekPayload>((resolve) => {
      joinerSocket2.once(SocketEvents.SEEK, (data) => resolve(data));
    });
    hostSocket.emit(SocketEvents.SEEK, { offsetSeconds: 90.0 });
    const seekData = await seekPromise;
    expect(seekData.offsetSeconds).toBe(90.0);
  });
});
