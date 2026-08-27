/**
 * WaveRooms Production Blackbox API Auditor
 * Executes end-to-end blackbox tests against live production endpoints with real payloads.
 */

interface TestResult {
  step: number;
  name: string;
  method: string;
  endpoint: string;
  status: number;
  durationMs: number;
  passed: boolean;
  details?: string;
}

const SERVER_BASE = process.env.API_BASE || 'https://server-lilac-beta-70.vercel.app';
const WEB_BASE = process.env.WEB_BASE || 'https://waverooms.birajdar.in';

async function runAudit() {
  console.log(`\n================================================================================`);
  console.log(`🧪 WaveRooms Production Blackbox Suite: Validating Live Endpoints`);
  console.log(`🌐 Server Base: ${SERVER_BASE}`);
  console.log(`🌐 Web App Base: ${WEB_BASE}`);
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  console.log(`================================================================================\n`);

  const results: TestResult[] = [];
  let stepCounter = 1;

  async function executeTest(
    name: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS',
    path: string,
    expectedStatus: number | number[],
    options?: {
      body?: any;
      headers?: Record<string, string>;
      baseUrl?: string;
      validatePayload?: (json: any) => void;
    }
  ): Promise<any> {
    const url = `${options?.baseUrl || SERVER_BASE}${path}`;
    const start = Date.now();
    const headers: Record<string, string> = {
      'Origin': WEB_BASE,
      'Referer': `${WEB_BASE}/`,
      'User-Agent': 'WaveRooms-Blackbox-Runner/1.0',
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers || {}),
    };

    let status = 0;
    let json: any = null;
    let text = '';
    let durationMs = 0;
    let passed = false;
    let details = '';

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });

      durationMs = Date.now() - start;
      status = res.status;
      const expectedArr = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        json = await res.json();
      } else {
        text = await res.text();
      }

      if (expectedArr.includes(status)) {
        if (options?.validatePayload && json) {
          options.validatePayload(json);
        }
        passed = true;
      } else {
        details = `Expected ${expectedArr.join('/')}, got ${status}. Body: ${text || JSON.stringify(json)}`;
      }
    } catch (err: any) {
      durationMs = Date.now() - start;
      details = `Exception: ${err?.message || err}`;
    }

    const testItem: TestResult = {
      step: stepCounter++,
      name,
      method,
      endpoint: path,
      status,
      durationMs,
      passed,
      details: details || undefined,
    };

    results.push(testItem);

    const badge = passed ? '✅ PASS' : '❌ FAIL';
    console.log(
      `${badge} [Step ${testItem.step}] ${method.padEnd(6)} ${path.padEnd(45)} HTTP ${status} (${durationMs}ms)`
    );
    if (!passed && details) {
      console.log(`   ↳ ⚠️ ${details}`);
    }

    return json;
  }

  // --- 1. Health Endpoint ---
  await executeTest('Server Health Check', 'GET', '/health', 200, {
    validatePayload: (data) => {
      if (data.status !== 'ok') throw new Error(`Invalid status: ${data.status}`);
    },
  });

  // --- 2. CORS Preflight Check ---
  await executeTest('CORS Preflight /api/rooms', 'OPTIONS', '/api/rooms', [200, 204], {
    headers: {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });

  // --- 3. Create Ephemeral Room ---
  let hostToken = '';
  let roomId = '';
  let roomCode = '';
  let hostUserId = '';

  const createRoomRes = await executeTest('Create Room (Host: Rushirw)', 'POST', '/api/rooms', 201, {
    body: { displayName: 'Rushirw' },
    validatePayload: (data) => {
      if (!data.room?.id || !data.room?.code || !data.token) {
        throw new Error('Missing room attributes in payload');
      }
      roomId = data.room.id;
      roomCode = data.room.code;
      hostToken = data.token;
      hostUserId = data.user.userId;
    },
  });

  // --- 4. Join Ephemeral Room ---
  let listenerToken = '';
  await executeTest(`Join Room (Code: ${roomCode})`, 'POST', '/api/rooms/join', 200, {
    body: { code: roomCode, displayName: 'Listener Alex' },
    validatePayload: (data) => {
      if (data.room?.id !== roomId) throw new Error('Joined room id mismatch');
      listenerToken = data.token;
    },
  });

  // --- 5. Fetch Room Details & State ---
  await executeTest(`Get Room State (/api/rooms/${roomId})`, 'GET', `/api/rooms/${roomId}`, 200, {
    headers: { Authorization: `Bearer ${hostToken}` },
    validatePayload: (data) => {
      if (data.room?.id !== roomId) throw new Error('Room state id mismatch');
      if (data.room?.status !== 'active') throw new Error('Room is not active');
    },
  });

  // --- 6. Storage: Generate Upload URL (Standard) ---
  await executeTest('Generate Upload URL (/api/storage/upload-url)', 'POST', '/api/storage/upload-url', 200, {
    headers: { Authorization: `Bearer ${hostToken}` },
    body: {
      roomId,
      filename: '004 koli jjm 26.mp3',
      mimeType: 'audio/mpeg',
      contentType: 'audio/mpeg',
    },
    validatePayload: (data) => {
      if (!data.uploadUrl || !data.storageKey) throw new Error('Missing uploadUrl or storageKey');
    },
  });

  // --- 7. Storage: Generate Presigned URL (Direct) ---
  await executeTest('Generate Presigned URL (/api/storage/presigned-url)', 'POST', '/api/storage/presigned-url', 200, {
    headers: { Authorization: `Bearer ${hostToken}` },
    body: {
      roomId,
      filename: 'synthetic_sunrise.mp3',
      contentType: 'audio/mpeg',
    },
    validatePayload: (data) => {
      if (!data.uploadUrl || !data.storageKey) throw new Error('Missing uploadUrl or storageKey');
    },
  });

  // --- 8. Storage: Parameterized Presigned URL ---
  await executeTest(
    `Generate Room Presigned URL (/api/storage/rooms/${roomId}/presigned-url)`,
    'POST',
    `/api/storage/rooms/${roomId}/presigned-url`,
    200,
    {
      headers: { Authorization: `Bearer ${hostToken}` },
      body: {
        filename: '004 koli jjm 26.mp3',
        contentType: 'audio/mpeg',
      },
      validatePayload: (data) => {
        if (!data.uploadUrl || !data.storageKey) throw new Error('Missing uploadUrl or storageKey');
      },
    }
  );

  // --- 9. Register Uploaded Song ---
  let registeredSongId = '';
  const songStorageKey = `rooms/${roomId}/synthetic_sunrise.mp3`;
  await executeTest(
    `Register Song Metadata (/api/storage/rooms/${roomId}/songs)`,
    'POST',
    `/api/storage/rooms/${roomId}/songs`,
    201,
    {
      headers: { Authorization: `Bearer ${hostToken}` },
      body: {
        title: 'Synthetic Sunrise',
        artist: 'Antigravity Sound',
        duration: 210,
        storageKey: songStorageKey,
        storageUrl: `/uploads/${songStorageKey}`,
        uploaderId: hostUserId,
      },
      validatePayload: (data) => {
        if (!data.song?.id) throw new Error('Missing created song id');
        registeredSongId = data.song.id;
      },
    }
  );

  // --- 10. List Room Uploaded Songs ---
  await executeTest(
    `List Room Songs (/api/storage/rooms/${roomId}/songs)`,
    'GET',
    `/api/storage/rooms/${roomId}/songs`,
    200,
    {
      headers: { Authorization: `Bearer ${hostToken}` },
      validatePayload: (data) => {
        if (!Array.isArray(data.songs) || data.songs.length === 0) {
          throw new Error('No songs returned from room');
        }
      },
    }
  );

  // --- 11. YouTube Video Metadata (oEmbed) ---
  await executeTest('YouTube Video Info (/api/youtube/info)', 'POST', '/api/youtube/info', 200, {
    body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    validatePayload: (data) => {
      if (!data.info?.title || !data.info?.thumbnail) throw new Error('Invalid YouTube info payload');
    },
  });

  // --- 12. YouTube Queue Track ---
  await executeTest('Queue YouTube Track (/api/youtube/queue)', 'POST', '/api/youtube/queue', [200, 201], {
    headers: { Authorization: `Bearer ${hostToken}` },
    body: {
      roomId,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      uploaderId: hostUserId,
    },
    validatePayload: (data) => {
      if (!data.song?.id) throw new Error('Song was not enqueued');
    },
  });

  // --- 13. Spotify Track Metadata ---
  await executeTest('Spotify Track Info (/api/spotify/info)', 'POST', '/api/spotify/info', 200, {
    body: { url: 'https://open.spotify.com/track/1oCEaLR4y29RtRstRiJ3Ok' },
    validatePayload: (data) => {
      if (!data.info?.title || !data.info?.thumbnail) throw new Error('Invalid Spotify info payload');
    },
  });

  // --- 14. Spotify Queue Track ---
  await executeTest('Queue Spotify Track (/api/spotify/queue)', 'POST', '/api/spotify/queue', [200, 201], {
    headers: { Authorization: `Bearer ${hostToken}` },
    body: {
      roomId,
      url: 'https://open.spotify.com/track/1oCEaLR4y29RtRstRiJ3Ok',
      title: 'Blame',
      artist: 'Kirdaar, DRJ Sohail, Kod.E',
      uploaderId: hostUserId,
    },
    validatePayload: (data) => {
      if (!data.song?.id) throw new Error('Spotify song was not enqueued');
    },
  });

  // --- 15. Delete Song from Room ---
  if (registeredSongId) {
    await executeTest(
      `Delete Song (/api/storage/rooms/${roomId}/songs/${registeredSongId})`,
      'DELETE',
      `/api/storage/rooms/${roomId}/songs/${registeredSongId}`,
      200,
      {
        headers: { Authorization: `Bearer ${hostToken}` },
        validatePayload: (data) => {
          if (!data.success) throw new Error('Delete returned false');
        },
      }
    );
  }

  // --- 16. Web App Static Promo Video Stream ---
  await executeTest('Web App Promo Video Stream', 'GET', '/waveRooms_promo.mp4', 200, {
    baseUrl: WEB_BASE,
  });

  // Print Summary Table
  const total = results.length;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = total - passedCount;

  console.log(`\n================================================================================`);
  console.log(`📊 FINAL BLACKBOX AUDIT RESULTS:`);
  console.log(`   Total Tests Executed: ${total}`);
  console.log(`   Passed:               ${passedCount} ✅`);
  console.log(`   Failed:               ${failedCount} ${failedCount > 0 ? '❌' : ''}`);
  console.log(`   Success Rate:         ${((passedCount / total) * 100).toFixed(1)}%`);
  console.log(`================================================================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Fatal error during audit:', err);
  process.exit(1);
});
