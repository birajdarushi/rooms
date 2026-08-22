import { Server } from 'socket.io';
import http from 'http';
import { prisma } from '../db/prisma';
import { storageService } from '../services/storage';
import { teardownRoom } from '../sockets/roomLifecycle';

// Mock storage delete call
jest.spyOn(storageService, 'deleteRoomAudioFiles').mockResolvedValue();

const mockIo: any = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
};

describe('Backend: Room Ephemeral Lifecycle & Grace Period', () => {
  let roomId: string;
  let roomCode: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    await prisma.queueItem.deleteMany();
    await prisma.song.deleteMany();
    await prisma.room.deleteMany();

    const room = await prisma.room.create({
      data: {
        code: 'TESTL',
        hostId: 'host_123',
        status: 'active',
      },
    });
    roomId = room.id;
    roomCode = room.code;
  });

  afterAll(async () => {
    await prisma.queueItem.deleteMany();
    await prisma.song.deleteMany();
    await prisma.room.deleteMany();
    await prisma.$disconnect();
  });

  it('explicitly ending a room marks status ended, emits room:ended, and purges audio files', async () => {
    const session: any = {
      roomId,
      roomCode,
      hostId: 'host_123',
      hostSocketId: 'sock_123',
      hostDisconnectTimer: null,
      gracePeriodEndsAt: null,
      syncPulseTimer: null,
      connectedMembers: new Map(),
    };

    await teardownRoom(mockIo, session, 'host_ended');

    // 1. Check DB
    const updatedRoom = await prisma.room.findUnique({ where: { id: roomId } });
    expect(updatedRoom?.status).toBe('ended');
    expect(updatedRoom?.playbackState).toBe('idle');

    // 2. Check Socket broadcast
    expect(mockIo.to).toHaveBeenCalledWith(roomCode);
    expect(mockIo.emit).toHaveBeenCalledWith('room:ended', { reason: 'host_ended' });

    // 3. Check Storage deletion invoked with roomId
    expect(storageService.deleteRoomAudioFiles).toHaveBeenCalledWith(roomId);
  });

  it('grace period expiry triggers teardown and storage deletion with grace_expired reason', async () => {
    const session: any = {
      roomId,
      roomCode,
      hostId: 'host_123',
      hostSocketId: null,
      hostDisconnectTimer: null,
      gracePeriodEndsAt: Date.now() - 1000,
      syncPulseTimer: null,
      connectedMembers: new Map(),
    };

    await teardownRoom(mockIo, session, 'grace_expired');

    const updatedRoom = await prisma.room.findUnique({ where: { id: roomId } });
    expect(updatedRoom?.status).toBe('ended');
    expect(mockIo.emit).toHaveBeenCalledWith('room:ended', { reason: 'grace_expired' });
    expect(storageService.deleteRoomAudioFiles).toHaveBeenCalledWith(roomId);
  });
});
