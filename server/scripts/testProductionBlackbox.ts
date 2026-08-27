/**
 * Comprehensive Black Box Production API & Real-User Flow Verification Suite
 *
 * Tests every single API endpoint with realistic payloads and socket sync against https://api-room.birajdar.in.
 */
import { io } from 'socket.io-client';

const BASE_URL = process.env.TARGET_URL || 'https://api-room.birajdar.in';

async function runFullBlackboxSuite() {
  console.log(`=======================================================`);
  console.log(`🚀 RUNNING PERMANENT PRODUCTION BLACKBOX API TEST SUITE`);
  console.log(`🎯 Target URL: ${BASE_URL}`);
  console.log(`=======================================================\n`);

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  async function test(name: string, fn: () => Promise<void>) {
    totalTests++;
    try {
      await fn();
      passedTests++;
      console.log(`  ✅ [PASS ${passedTests}] ${name}`);
    } catch (err: any) {
      failedTests++;
      console.error(`  ❌ [FAIL ${failedTests}] ${name}`);
      console.error(`     Error: ${err.message || err}\n`);
    }
  }

  let testRoom: any = null;
  let hostToken: string = '';
  let listenerToken: string = '';

  // 1. Health Check
  await test('1. Health Check GET /health', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    if (data.status !== 'ok') throw new Error(`Unexpected payload: ${JSON.stringify(data)}`);
  });

  // 2. Preflight OPTIONS on /api/rooms
  await test('2. Preflight OPTIONS /api/rooms', async () => {
    const res = await fetch(`${BASE_URL}/api/rooms`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://room.birajdar.in',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization, sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform',
      },
    });
    if (res.status !== 200 && res.status !== 204) {
      throw new Error(`OPTIONS failed with status ${res.status}`);
    }
  });

  // 3. Create Room POST /api/rooms
  await test('3. Create Room POST /api/rooms', async () => {
    const res = await fetch(`${BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://room.birajdar.in',
      },
      body: JSON.stringify({ displayName: 'rushir' }),
    });
    if (res.status !== 201) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    if (!data.room || !data.room.code || !data.token) {
      throw new Error(`Invalid create room response: ${JSON.stringify(data)}`);
    }
    testRoom = data.room;
    hostToken = data.token;
  });

  // 4. Preflight OPTIONS on /api/rooms/join
  await test('4. Preflight OPTIONS /api/rooms/join', async () => {
    const res = await fetch(`${BASE_URL}/api/rooms/join`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://room.birajdar.in',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    if (res.status !== 200 && res.status !== 204) {
      throw new Error(`OPTIONS failed with status ${res.status}`);
    }
  });

  // 5. Join Room POST /api/rooms/join
  await test('5. Join Room POST /api/rooms/join', async () => {
    if (!testRoom) throw new Error('No test room available');
    const res = await fetch(`${BASE_URL}/api/rooms/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://room.birajdar.in',
      },
      body: JSON.stringify({
        code: testRoom.code,
        displayName: 'Listener John',
      }),
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    if (!data.user || data.user.isHost !== false || !data.token) {
      throw new Error(`Invalid join room response: ${JSON.stringify(data)}`);
    }
    listenerToken = data.token;
  });

  // 6. Get Room Details GET /api/rooms/:id
  await test('6. Get Room Details GET /api/rooms/:id', async () => {
    if (!testRoom) throw new Error('No test room available');
    const res = await fetch(`${BASE_URL}/api/rooms/${testRoom.id}`);
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    if (!data.room || data.room.id !== testRoom.id) {
      throw new Error(`Invalid room detail response: ${JSON.stringify(data)}`);
    }
  });

  // 7. Generate Presigned Upload URL POST /api/storage/presigned-url
  let presignedUploadUrl = '';
  let publicAudioUrl = '';
  await test('7. Presigned Upload URL POST /api/storage/presigned-url', async () => {
    if (!testRoom) throw new Error('No test room available');
    const res = await fetch(`${BASE_URL}/api/storage/presigned-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hostToken}`,
      },
      body: JSON.stringify({
        roomId: testRoom.id,
        filename: 'blackbox_test_track.mp3',
        contentType: 'audio/mpeg',
      }),
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    if (!data.uploadUrl || !data.publicUrl) {
      throw new Error(`Invalid presigned response: ${JSON.stringify(data)}`);
    }
    presignedUploadUrl = data.uploadUrl;
    publicAudioUrl = data.publicUrl;
  });

  // 8. Upload Binary Audio File to Presigned URL
  await test('8. Upload Binary Audio PUT /uploads/local-upload', async () => {
    if (!presignedUploadUrl) throw new Error('No presigned upload URL');
    const dummyAudioBuffer = Buffer.alloc(100, 0xff);
    const res = await fetch(presignedUploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'audio/mpeg' },
      body: dummyAudioBuffer,
    });
    if (!res.ok) throw new Error(`Upload failed with status ${res.status}: ${await res.text()}`);
  });

  // 9. Register Song in Room Queue POST /api/storage/rooms/:id/songs
  await test('9. Register Uploaded Song POST /api/storage/rooms/:id/songs', async () => {
    if (!testRoom) throw new Error('No test room available');
    const res = await fetch(`${BASE_URL}/api/storage/rooms/${testRoom.id}/songs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hostToken}`,
      },
      body: JSON.stringify({
        storageUrl: publicAudioUrl,
        storageKey: `rooms/${testRoom.id}/blackbox_test_track.mp3`,
        title: 'Permanent Domain Beat',
        artist: 'WaveRooms',
        duration: 180,
      }),
    });
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`Status ${res.status}: ${await res.text()}`);
    }
    const data: any = await res.json();
    if (!data.song || !data.queueItem) {
      throw new Error(`Invalid register song response: ${JSON.stringify(data)}`);
    }
  });

  // 10. WebSocket Real-time Bidirectional Connection
  await test('10. WebSocket Socket.io Bidirectional Connection', async () => {
    if (!testRoom) throw new Error('No test room available');
    const socket = io(BASE_URL, {
      transports: ['websocket', 'polling'],
      timeout: 8000,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.disconnect();
        reject(new Error('WebSocket connection timed out'));
      }, 7000);

      socket.on('connect', () => {
        socket.emit('join-room', {
          roomCode: testRoom.code,
          userId: 'test_ws_user',
          displayName: 'Test Socket User',
          isHost: false,
        });
        clearTimeout(timeout);
        socket.disconnect();
        resolve();
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        socket.disconnect();
        reject(err);
      });
    });
  });

  console.log(`\n=======================================================`);
  console.log(`🏁 PRODUCTION SUITE RESULTS: ${passedTests}/${totalTests} PASSED (Failures: ${failedTests})`);
  console.log(`=======================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runFullBlackboxSuite().catch((err) => {
  console.error('CRITICAL UNCAUGHT TEST ERROR:', err);
  process.exit(1);
});
