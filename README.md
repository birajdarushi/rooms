# 🎵 Room — Synced Listening Party App

**Room** is an ephemeral, real-time synchronized listening party application built with **React Native (Expo)** and a **Node.js / Express / Socket.io** backend.

A host creates an ephemeral room and queues audio tracks (uploaded directly to S3 / Cloudflare R2 object storage via pre-signed URLs). Listeners join via a 5-character alphanumeric room code and hear music synchronized in near real-time (target drift: <300ms, auto-corrected via 5-sample median clock-offset estimation and periodic sync pulses).

---

## 🚀 Key Features & Architecture

- **Load-Bearing Synchronization**:
  - **Clock Sync on Connect**: 5-sample ping/pong exchange with median filtering to discard network latency spikes:
    $$\text{clockOffset} = \text{serverTime} + \frac{\text{RTT}}{2} - \text{clientReceivedAt}$$
  - **Target Playback Calculation**:
    $$\text{targetPosition} = \text{offsetSeconds} + \frac{(\text{Date.now()} + \text{clockOffset}) - \text{startedAt}}{1000}$$
  - **Silent Drift Correction**: Server broadcasts `sync-pulse` every 10 seconds. If drift exceeds $300\text{ms}$, the player silently reseeks without pausing.
  - **Late-Joiner Mid-Song Sync**: Listeners joining an ongoing party immediately compute playback position and sync into the active song without restarting.
  - **Auto-Advance**: Seamlessly transitions to the next queued track when the current song completes.
- **Direct-to-Storage Uploads**:
  - Direct PUT uploads via pre-signed S3/R2 URLs (no streaming through app server).
  - Built-in zero-credential local storage fallback for offline dev.
- **Ephemeral Room Lifecycle**:
  - **Explicit End**: Host ends room $\to$ broadcasts `room-ended`, deletes all uploaded audio files from storage, and purges room DB records.
  - **Host Disconnect Grace Period**: 25-second countdown covers network blips/backgrounding. If host returns, room resumes; if expired, full room teardown and file cleanup execute automatically.
- **Universal Audio Engine**:
  - Production native build compatibility (`react-native-track-player` / `expo-av` background audio).
  - Web & desktop multi-tab browser testing compatibility.

---

## 📁 Repository Structure

```
.
├── app/                  # Expo React Native App (TypeScript)
│   ├── src/
│   │   ├── api/          # REST Client (Rooms, Pre-signed uploads)
│   │   ├── components/   # VinylVisualizer, PlayerControls, QueueDrawer, UploadModal
│   │   ├── hooks/        # useSyncEngine, useRoomSocket
│   │   ├── screens/      # HomeScreen, RoomScreen
│   │   ├── services/     # Universal AudioEngine
│   │   ├── utils/        # syncMath (clock offset, drift tolerance)
│   │   └── __tests__/    # App-level Jest unit tests
│   ├── App.tsx           # Navigation & Root Provider
│   └── package.json
├── server/               # Node.js + Express + Socket.io (TypeScript)
│   ├── prisma/           # SQLite / PostgreSQL schema (Room, Song, QueueItem)
│   ├── src/
│   │   ├── config/       # Environment variables
│   │   ├── db/           # Prisma client & data mappers
│   │   ├── routes/       # REST routes (/api/rooms, /api/storage)
│   │   ├── services/     # S3StorageService (Pre-signed URLs, cleanup)
│   │   ├── sockets/      # syncHandler, roomLifecycle
│   │   └── __tests__/    # Backend unit & in-process socket integration tests
│   └── package.json
├── shared/               # Shared TypeScript types & socket contracts
│   └── index.ts
└── README.md
```

---

## ⚙️ Environment Variables & Configuration

### Backend (`server/.env`)

```env
# Server
PORT=4000
NODE_ENV=development
JWT_SECRET=super_secret_room_jwt_key_987654321

# Database (SQLite default for zero-config local run, or PostgreSQL)
DATABASE_URL="file:./dev.db"
# Example Postgres: DATABASE_URL="postgres://postgres:password@localhost:5432/roomdb"

# Storage Provider: 'local' (zero-config local dev) or 's3' / 'r2'
STORAGE_PROVIDER=local

# AWS S3 / Cloudflare R2 Credentials (Only if STORAGE_PROVIDER is s3 or r2)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=room-audio-bucket
# AWS_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
# PUBLIC_STORAGE_URL=https://cdn.yourdomain.com
```

---

## 🛠️ Getting Started

### 1. Start Backend Server

```bash
cd server
npm install
npx prisma generate
npx prisma db push
npm run dev
```

The server starts at `http://localhost:4000`.

### 2. Start Expo App

```bash
cd app
npm install
npm run web      # Open in web browser (ideal for multi-client side-by-side testing)
# or
npm start        # Launch Metro bundler for iOS / Android / Expo Go
```

---

## 🧪 Automated Test Suite

Both `/server` and `/app` include comprehensive automated tests covering pure sync math, queue logic, REST endpoints, lifecycle teardown, and in-process Socket.io synchronization.

### Run Backend Tests (`/server`)

```bash
cd server
npm test
```
**Covers (24 tests):**
- Room CRUD, 5-character alphanumeric uppercase code generation, host assignment.
- Queue addition, reordering, deletion, and auto-advance.
- Pre-signed upload URL generation and metadata persistence.
- Room ephemeral lifecycle, explicit host end, grace period expiration, and storage file deletion.
- Pure sync math: 5-sample median clock calibration, latency outlier rejection, target seek position, and >300ms drift thresholding.
- In-process live `Socket.io` integration: multi-client join, broadcast parity, play/pause/seek/skip.

### Run App Tests (`/app`)

```bash
cd app
npm test
```
**Covers (5 tests):**
- Clock offset calculation & median filtering.
- Target position calculation from server timestamps.
- Drift threshold evaluation (<300ms no-op vs >300ms silent reseek).
- Role-based permissions (Host controls vs Listener locked state).

---

## 📋 Manual Multi-Device Verification Plan

Perform this manual verification to observe synchronized listening in action:

1. **Host Setup**:
   - Open browser window 1 at `http://localhost:8081` (or mobile Expo app).
   - Enter display name `DJ Alex` $\to$ click **Create Party**.
   - Note the 5-character room code displayed in the header (e.g. `ABC42`).
2. **Upload Audio**:
   - As Host, click **+ Add Song** in the queue or player.
   - Choose an audio file (MP3, WAV, M4A).
   - Verify file uploads directly to storage and appears in the **Queue** list.
3. **Joiner 1 (On-time Join)**:
   - Open browser window 2 (or a separate mobile device/incognito window).
   - Switch tab to **Join Room**, enter code `ABC42` and display name `Listener Sam`.
   - Verify Joiner 1 connects, listener count updates to `2`, and the queue is visible.
4. **Playback & Real-time Sync**:
   - Host clicks **Play**.
   - Verify both Host and Joiner 1 start playback simultaneously within <300ms drift.
   - Observe the live **Drift** metric in the top pill (e.g. `Drift: 12ms · In Sync`).
   - Host moves the seek bar to `1:15` $\to$ verify Joiner 1 immediately jumps to `1:15` without latency lag.
   - Host clicks **Pause** $\to$ Joiner 1 pauses immediately.
5. **Joiner 2 (Late-Joiner mid-song)**:
   - Host presses **Play** at `0:30`.
   - Open browser window 3, enter code `ABC42` and join as `Late Joiner Dave`.
   - Verify Joiner 2 immediately computes position and syncs into `0:30+` mid-song without starting over at `0:00`.
6. **Simulated Drift Correction**:
   - Manually lag Joiner 1 audio (or mute/throttle network tab for 1s).
   - On the next 10-second `sync-pulse`, verify the sync engine detects drift $>300\text{ms}$ and silently snaps Joiner 1 back into alignment.
7. **Auto-Advance**:
   - Let the current song finish (or seek near end).
   - Verify both Host and Joiners automatically advance to Song 2 in the queue.
8. **Host Disconnect Grace Period & Teardown**:
   - Close or disconnect the Host's browser tab.
   - Joiners see the warning banner: `Host disconnected! Reconnecting... Room ends in 25s`.
   - Reopen Host tab before 25s $\to$ grace period clears.
   - Host clicks **End Party** $\to$ Joiners receive `Party Ended` alert and return home; all uploaded audio files are purged from storage.

---

## 🚫 Out of Scope for v1

- Persistent libraries/playlists across rooms (rooms & audio are strictly ephemeral).
- Joiner queue editing (host-managed queue only).
- User accounts / full authentication system (anonymous sessions with display names).
- Third-party streaming services (Spotify/Apple Music API integration).
- Push notifications and cross-room social chat.
