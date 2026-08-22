import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen } from './src/screens/HomeScreen';
import { RoomScreen } from './src/screens/RoomScreen';
import { Room, UserSession } from './src/types';
import { loadSession, clearSession } from './src/services/SessionStorage';
import { api, setApiBaseUrl } from './src/api/client';
import { ThemeProvider, useAppTheme } from './src/context/ThemeContext';

type AppState = 'loading' | 'home' | 'room';

function MainApp() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);

  const { isDark, theme } = useAppTheme();

  // ── On mount: check for a persisted session ──────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const session = await loadSession();
        if (!session) {
          setAppState('home');
          return;
        }

        // Restore server URL first
        setApiBaseUrl(session.serverUrl);

        // Verify the room still exists on the server
        const roomState = await api.getRoomState(session.roomId);
        if (!roomState || roomState.room.status === 'ended') {
          console.log('[App] Saved room is ended, clearing session.');
          await clearSession();
          setAppState('home');
          return;
        }

        // ✅ Room is still active — auto-restore into the room
        console.log('[App] Restored session for room', session.roomCode);
        setActiveRoom(roomState.room);
        setCurrentUser({
          userId: session.userId,
          displayName: session.displayName,
          isHost: session.isHost,
        });
        setAppState('room');
      } catch (e) {
        console.warn('[App] Session restore failed:', e);
        await clearSession();
        setAppState('home');
      }
    })();
  }, []);

  const handleEnterRoom = (room: Room, user: UserSession) => {
    setActiveRoom(room);
    setCurrentUser(user);
    setAppState('room');
  };

  const handleExitRoom = async () => {
    await clearSession();
    setActiveRoom(null);
    setCurrentUser(null);
    setAppState('home');
  };

  // ── Splash / Loading screen while restoring session ──────────────────────
  if (appState === 'loading') {
    return (
      <View style={[styles.splash, { backgroundColor: theme.bg }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.splashLogo}>
          <Text style={[styles.splashTitle, { color: theme.textPrimary }]}>ROOM</Text>
          <Text style={[styles.splashSub, { color: theme.textSecondary }]}>Resuming your session…</Text>
        </View>
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 32 }} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {appState === 'room' && activeRoom && currentUser ? (
        <RoomScreen room={activeRoom} user={currentUser} onExit={handleExitRoom} />
      ) : (
        <HomeScreen onEnterRoom={handleEnterRoom} />
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <MainApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    alignItems: 'center',
  },
  splashTitle: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 6,
  },
  splashSub: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
});
