import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { nanoid, customAlphabet } from 'nanoid';
import { prisma, formatRoom, formatSong, formatQueueItem } from '../db/prisma';
import { config } from '../config/env';
import { publishToRoom } from '../services/ablyPublisher';
import { SocketEvents, CreateRoomResponse, JoinRoomResponse, RoomState } from '../shared';

const generateRoomCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 5);

export const roomsRouter = Router();

// Create new ephemeral room
roomsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { displayName = 'Host' } = req.body;
    const hostId = `user_${nanoid(10)}`;

    let code = generateRoomCode();
    let existing = await prisma.room.findUnique({ where: { code } });
    let attempts = 0;
    while (existing && attempts < 10) {
      code = generateRoomCode();
      existing = await prisma.room.findUnique({ where: { code } });
      attempts++;
    }

    const room = await prisma.room.create({
      data: {
        code,
        hostId,
        status: 'active',
        playbackState: 'idle',
        offsetSeconds: 0,
        startedAt: null,
      },
    });

    const token = jwt.sign(
      { userId: hostId, displayName, roomId: room.id, isHost: true },
      config.jwtSecret,
      { expiresIn: '1d' }
    );

    const responseData: CreateRoomResponse = {
      room: formatRoom(room),
      user: { userId: hostId, displayName, isHost: true },
      token,
    };

    return res.status(201).json(responseData);
  } catch (error: any) {
    console.error('Error creating room:', error);
    return res.status(500).json({ error: 'Failed to create room', details: error?.message });
  }
});

// Join existing room by code — returns full room state so client doesn't need ROOM_STATE_SYNC event
roomsRouter.post('/join', async (req: Request, res: Response) => {
  try {
    const { code, displayName = 'Listener' } = req.body;

    if (!code) return res.status(400).json({ error: 'Room code is required' });

    const normalizedCode = code.trim().toUpperCase();
    const room = await prisma.room.findUnique({
      where: { code: normalizedCode },
      include: {
        songs: true,
        queueItems: {
          include: { song: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!room || room.status === 'ended') {
      return res.status(404).json({ error: 'Room not found or has ended' });
    }

    const userId = `user_${nanoid(10)}`;
    const isHost = room.hostId === userId;

    const token = jwt.sign(
      { userId, displayName, roomId: room.id, isHost },
      config.jwtSecret,
      { expiresIn: '1d' }
    );

    const currentSong = room.currentSongId
      ? (room.songs.find((s) => s.id === room.currentSongId) ?? null)
      : null;

    // Notify room members of new member (member count via Ably presence, but we can also broadcast)
    await publishToRoom(normalizedCode, SocketEvents.MEMBER_COUNT, {
      count: null, // clients will use Ably presence for accurate count
      joined: displayName,
    }).catch(() => {});

    const responseData: JoinRoomResponse & {
      queue: any[];
      currentSong: any;
      playbackState: string;
      startedAt: number | null;
      offsetSeconds: number;
    } = {
      room: formatRoom(room),
      user: { userId, displayName, isHost },
      token,
      // Full room state returned directly so client doesn't need a separate socket event
      queue: room.queueItems.map(formatQueueItem),
      currentSong: currentSong ? formatSong(currentSong) : null,
      playbackState: room.playbackState,
      startedAt: room.startedAt ? Number(room.startedAt) : null,
      offsetSeconds: room.offsetSeconds,
    };

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Error joining room:', error);
    return res.status(500).json({ error: 'Failed to join room' });
  }
});

// Get room details & queue
roomsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        songs: true,
        queueItems: {
          include: { song: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!room || room.status === 'ended') {
      return res.status(404).json({ error: 'Room not found' });
    }

    let currentSong = null;
    if (room.currentSongId) {
      const found = room.songs.find((s) => s.id === room.currentSongId);
      if (found) currentSong = formatSong(found);
    }

    const roomState: RoomState = {
      room: formatRoom(room),
      currentSong,
      queue: room.queueItems.map(formatQueueItem),
      hostConnected: room.status === 'active',
      memberCount: 1,
      serverTime: Date.now(),
    };

    return res.json(roomState);
  } catch (error) {
    console.error('Error fetching room:', error);
    return res.status(500).json({ error: 'Failed to fetch room state' });
  }
});
