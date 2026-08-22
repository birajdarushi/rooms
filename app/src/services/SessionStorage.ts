/**
 * SessionStorage — cross-platform persisted session.
 * Web:    localStorage
 * Native: @react-native-async-storage/async-storage (if available), else in-memory
 *
 * The session stores enough to restore the user directly into their room
 * without re-creating a room. After 24h it expires automatically.
 */

import { Platform } from 'react-native';

const SESSION_KEY = 'room_app_session_v2';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface PersistedSession {
  token: string;
  userId: string;
  displayName: string;
  roomId: string;
  roomCode: string;
  isHost: boolean;
  serverUrl: string;   // so the right backend is used after restore
  savedAt: number;     // epoch ms — used to check expiry
}

// ─── Platform-aware storage primitives ───────────────────────────────────────

async function storageGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  // Native: try AsyncStorage, gracefully degrade if not installed
  try {
    const AS = require('@react-native-async-storage/async-storage').default;
    return await AS.getItem(key);
  } catch {
    return null;
  }
}

async function storageSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { localStorage.setItem(key, value); } catch { /* quota */ }
    return;
  }
  try {
    const AS = require('@react-native-async-storage/async-storage').default;
    await AS.setItem(key, value);
  } catch { /* not installed */ }
}

async function storageRemove(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { localStorage.removeItem(key); } catch { }
    return;
  }
  try {
    const AS = require('@react-native-async-storage/async-storage').default;
    await AS.removeItem(key);
  } catch { }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Save a session after creating or joining a room. */
export async function saveSession(session: Omit<PersistedSession, 'savedAt'>): Promise<void> {
  const full: PersistedSession = { ...session, savedAt: Date.now() };
  await storageSet(SESSION_KEY, JSON.stringify(full));
  console.log('[Session] Saved session for room', session.roomCode, 'as', session.isHost ? 'HOST' : 'listener');
}

/** Load a valid (non-expired) session. Returns null if none / expired. */
export async function loadSession(): Promise<PersistedSession | null> {
  try {
    const raw = await storageGet(SESSION_KEY);
    if (!raw) return null;
    const session: PersistedSession = JSON.parse(raw);
    if (!session.savedAt || Date.now() - session.savedAt > SESSION_TTL_MS) {
      console.log('[Session] Session expired, clearing.');
      await clearSession();
      return null;
    }
    console.log('[Session] Loaded session for room', session.roomCode, 'as', session.isHost ? 'HOST' : 'listener');
    return session;
  } catch {
    return null;
  }
}

/** Clear session — call when leaving a room or on explicit logout. */
export async function clearSession(): Promise<void> {
  await storageRemove(SESSION_KEY);
  console.log('[Session] Session cleared.');
}

/** Update the savedAt timestamp to extend the session TTL. */
export async function refreshSession(): Promise<void> {
  const session = await loadSession();
  if (session) {
    session.savedAt = Date.now();
    await storageSet(SESSION_KEY, JSON.stringify(session));
  }
}
