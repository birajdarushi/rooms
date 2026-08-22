import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Share,
  useWindowDimensions,
  ScrollView,
  StatusBar,
  Animated,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Headphones,
  ListMusic,
  Users,
  Settings,
  LogOut,
  Copy,
  Plus,
  Check,
  Info,
  Share2,
} from 'lucide-react-native';
import { Room, UserSession, Song, QueueItem } from '../types';
import { useRoomSocket } from '../hooks/useRoomSocket';
import { NowPlayingCard } from '../components/NowPlayingCard';
import { QueueView } from '../components/QueueView';
import { PeopleView } from '../components/PeopleView';
import { SettingsView } from '../components/SettingsView';
import { UploadModal } from '../components/UploadModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { LiveStreamBanner } from '../components/LiveStreamBanner';
import { liveAudioStreamer } from '../services/LiveAudioStreamer';
import { api } from '../api/client';
import { useAppTheme } from '../context/ThemeContext';

interface Props {
  room: Room;
  user: UserSession;
  onExit: () => void;
}

type TabType = 'listen' | 'queue' | 'people' | 'settings';

export const RoomScreen: React.FC<Props> = ({ room, user, onExit }) => {
  const [activeTab, setActiveTab] = useState<TabType>('listen');
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [endedModalVisible, setEndedModalVisible] = useState(false);
  const [endReason, setEndReason] = useState<string>('host_ended');
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Toast animation ref
  const toastAnim = useRef(new Animated.Value(0)).current;

  // REST preload
  const [restQueue, setRestQueue] = useState<QueueItem[]>([]);
  const [restCurrentSong, setRestCurrentSong] = useState<Song | null>(null);

  const { isDark, theme } = useAppTheme();

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const showToast = (message: string) => {
    setToastMessage(message);
    Animated.sequence([
      Animated.timing(toastAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.delay(2600),
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => setToastMessage(null));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const state = await api.getRoomState(room.id);
        if (!cancelled) {
          setRestQueue(state.queue || []);
          setRestCurrentSong(state.currentSong || null);
        }
      } catch (e) {
        console.warn('[RoomScreen] REST preload error:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room.id]);

  const handleRoomEnded = useCallback((reason: string) => {
    setEndReason(reason);
    setEndedModalVisible(true);
  }, []);

  const {
    socket,
    currentSong: socketSong,
    queue: socketQueue,
    memberCount,
    playbackState,
    hostStatus,
    clockOffset,
    latency,
    driftReport,
    isLiveStreaming,
    setIsLiveStreaming,
    emitPlay,
    emitPause,
    emitSeek,
    emitSkip,
    emitReorderQueue,
    emitRemoveFromQueue,
    isConnected,
    endParty,
  } = useRoomSocket(room, user, handleRoomEnded);

  const currentSong = socketSong ?? restCurrentSong;
  const queue = isConnected ? socketQueue : (socketQueue.length > 0 ? socketQueue : restQueue);
  const isPlaying = playbackState === 'playing';

  // ── Next & Previous Handlers ──────────────────────────────────────────────
  const handleNext = () => {
    if (!user.isHost) {
      showToast('🎧 You are a listener. Only the host can control playback.');
      return;
    }
    emitSkip();
  };

  const handlePrevious = () => {
    if (!user.isHost) {
      showToast('🎧 You are a listener. Only the host can control playback.');
      return;
    }
    const currentIdx = queue.findIndex((item) => item.songId === currentSong?.id);
    if (currentIdx > 0) {
      const prevItem = queue[currentIdx - 1];
      emitPlay(prevItem.songId, 0);
    } else {
      if (currentSong) {
        emitSeek(0);
      }
    }
  };

  const handlePlaySong = (songId: string) => {
    if (!user.isHost) {
      showToast('🎧 You are a listener. Only the host can control playback.');
      return;
    }
    emitPlay(songId, 0);
  };

  const handleCopyCode = async () => {
    const inviteUrl =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/?room=${room.code}`
        : `https://room.birajdar.in/?room=${room.code}`;

    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && (navigator as any).clipboard) {
        await (navigator as any).clipboard.writeText(inviteUrl);
        setCopied(true);
        showToast(`🔗 Invite link copied: ${inviteUrl}`);
        setTimeout(() => setCopied(false), 2500);
      }
    } else {
      Share.share({
        message: `Join my Room listening party! ${inviteUrl}`,
        url: inviteUrl,
      });
    }
  };

  const handleLeaveOrEnd = () => {
    setConfirmModalVisible(true);
  };

  const handleConfirmExit = () => {
    setConfirmModalVisible(false);
    endParty();
    onExit();
  };

  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 12);
  const bottomPadding = Math.max(insets.bottom, 12);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: topPadding }]}>
      {/* Top Header Bar */}
      <View style={[styles.topHeader, { borderBottomColor: theme.cardBorder }]}>
        {/* Left: Leave / End Button */}
        <TouchableOpacity style={styles.exitPill} onPress={handleLeaveOrEnd} activeOpacity={0.7}>
          <LogOut size={14} color="#ba1a1a" />
          <Text style={styles.exitPillText}>{user.isHost ? 'End' : 'Leave'}</Text>
        </TouchableOpacity>

        {/* Center: Room Code Chip & Share Pill */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={[styles.roomCodeChip, { backgroundColor: theme.pillBlueBg }]}
            onPress={handleCopyCode}
            activeOpacity={0.8}
          >
            <Text style={[styles.roomCodeLabel, { color: theme.pillBlueText }]}>ROOM</Text>
            <Text style={[styles.roomCodeValue, { color: theme.pillBlueText }]}>{room.code}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shareInviteChip, { backgroundColor: copied ? 'rgba(22, 163, 74, 0.15)' : theme.pillMintBg }]}
            onPress={handleCopyCode}
            activeOpacity={0.8}
          >
            {copied ? <Check size={12} color="#16a34a" /> : <Share2 size={12} color={theme.pillMintText} />}
            <Text style={[styles.shareInviteText, { color: copied ? '#16a34a' : theme.pillMintText }]}>
              {copied ? 'Copied Link' : 'Share'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Right: Members Count */}
        <TouchableOpacity
          style={[styles.membersChip, { backgroundColor: theme.pillBlueBg }]}
          onPress={() => setActiveTab('people')}
          activeOpacity={0.8}
        >
          <Users size={13} color={theme.pillBlueText} />
          <Text style={[styles.membersCountText, { color: theme.pillBlueText }]}>{memberCount}</Text>
        </TouchableOpacity>
      </View>

      {/* Main Layout Container */}
      <View style={styles.mainLayout}>
        {/* Desktop Left Sidebar (hidden on mobile) */}
        {isDesktop && (
          <View style={[styles.desktopSidebar, { backgroundColor: theme.bg, borderRightColor: theme.cardBorder }]}>
            <View style={styles.sidebarNavList}>
              <TouchableOpacity
                style={[
                  styles.sidebarNavItem,
                  activeTab === 'listen' && [styles.sidebarNavActive, { backgroundColor: theme.pillMintBg }],
                ]}
                onPress={() => setActiveTab('listen')}
                activeOpacity={0.8}
              >
                <Headphones size={20} color={activeTab === 'listen' ? theme.pillMintText : theme.textSecondary} />
                <Text
                  style={[
                    styles.sidebarNavText,
                    { color: theme.textSecondary },
                    activeTab === 'listen' && [styles.sidebarNavTextActive, { color: theme.pillMintText }],
                  ]}
                >
                  Listen
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sidebarNavItem,
                  activeTab === 'queue' && [styles.sidebarNavActive, { backgroundColor: theme.pillMintBg }],
                ]}
                onPress={() => setActiveTab('queue')}
                activeOpacity={0.8}
              >
                <ListMusic size={20} color={activeTab === 'queue' ? theme.pillMintText : theme.textSecondary} />
                <Text
                  style={[
                    styles.sidebarNavText,
                    { color: theme.textSecondary },
                    activeTab === 'queue' && [styles.sidebarNavTextActive, { color: theme.pillMintText }],
                  ]}
                >
                  Queue ({queue.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sidebarNavItem,
                  activeTab === 'people' && [styles.sidebarNavActive, { backgroundColor: theme.pillMintBg }],
                ]}
                onPress={() => setActiveTab('people')}
                activeOpacity={0.8}
              >
                <Users size={20} color={activeTab === 'people' ? theme.pillMintText : theme.textSecondary} />
                <Text
                  style={[
                    styles.sidebarNavText,
                    { color: theme.textSecondary },
                    activeTab === 'people' && [styles.sidebarNavTextActive, { color: theme.pillMintText }],
                  ]}
                >
                  People ({memberCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sidebarNavItem,
                  activeTab === 'settings' && [styles.sidebarNavActive, { backgroundColor: theme.pillMintBg }],
                ]}
                onPress={() => setActiveTab('settings')}
                activeOpacity={0.8}
              >
                <Settings size={20} color={activeTab === 'settings' ? theme.pillMintText : theme.textSecondary} />
                <Text
                  style={[
                    styles.sidebarNavText,
                    { color: theme.textSecondary },
                    activeTab === 'settings' && [styles.sidebarNavTextActive, { color: theme.pillMintText }],
                  ]}
                >
                  Settings
                </Text>
              </TouchableOpacity>
            </View>

            {/* Upload trigger in sidebar footer */}
            <View style={styles.sidebarFooter}>
              {user.isHost && (
                <TouchableOpacity
                  style={[styles.sidebarAddBtn, { backgroundColor: theme.accent }]}
                  onPress={() => setUploadModalVisible(true)}
                  activeOpacity={0.85}
                >
                  <Plus size={16} color="#ffffff" />
                  <Text style={styles.sidebarAddBtnText}>Add Track</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Content Canvas */}
        <View style={[styles.contentCanvas, { backgroundColor: theme.bg }]}>
          {activeTab === 'listen' && (
            <ScrollView
              style={styles.scrollViewWrapper}
              contentContainerStyle={[
                styles.canvasScrollContent,
                { paddingBottom: isDesktop ? 12 : 110, paddingTop: isDesktop ? 4 : 12 },
              ]}
              showsVerticalScrollIndicator={false}
            >
              <NowPlayingCard
                song={currentSong}
                queue={queue}
                playbackState={playbackState}
                isHost={user.isHost}
                memberCount={memberCount}
                roomCode={room.code}
                userDisplayName={user.displayName}
                isLiveStreaming={isLiveStreaming}
                onPlay={emitPlay}
                onPause={emitPause}
                onSeek={emitSeek}
                onNext={handleNext}
                onPrevious={handlePrevious}
                onOpenUpload={() => setUploadModalVisible(true)}
                onNavigateToQueue={() => setActiveTab('queue')}
                onShowNotice={showToast}
              />

              {/* 🔴 Active Live System Audio Loopback Stream Banner */}
              {isLiveStreaming && (
                <LiveStreamBanner
                  isHost={user.isHost}
                  roomId={room.id}
                  socket={socket}
                  onStop={() => setIsLiveStreaming(false)}
                />
              )}
            </ScrollView>
          )}

          {activeTab === 'queue' && (
            <QueueView
              queue={queue}
              currentSong={currentSong}
              isPlaying={isPlaying}
              isHost={user.isHost}
              onPlaySong={handlePlaySong}
              onRemoveSong={emitRemoveFromQueue}
              onOpenUpload={() => setUploadModalVisible(true)}
            />
          )}

          {activeTab === 'people' && (
            <PeopleView
              roomCode={room.code}
              memberCount={memberCount}
              isHost={user.isHost}
              userDisplayName={user.displayName}
            />
          )}

          {activeTab === 'settings' && isDesktop && (
            <SettingsView
              isHost={user.isHost}
              roomCode={room.code}
              clockOffset={clockOffset || 0}
              latency={latency || 0}
              driftReport={driftReport}
              hostStatus={hostStatus}
              onLeaveOrEnd={handleLeaveOrEnd}
            />
          )}
        </View>
      </View>

      {/* Floating Mobile Bottom Navigation Dock (3 Clean Tabs for Listeners & Hosts) */}
      {!isDesktop && (
        <View
          style={[
            styles.floatingBottomDock,
            {
              backgroundColor: theme.bottomBarBg,
              borderColor: theme.bottomBarBorder,
              marginBottom: bottomPadding,
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.bottomNavItem,
              activeTab === 'listen' && [styles.bottomNavActive, { backgroundColor: theme.pillMintBg }],
            ]}
            onPress={() => setActiveTab('listen')}
            activeOpacity={0.8}
          >
            <Headphones size={20} color={activeTab === 'listen' ? theme.pillMintText : theme.textSecondary} />
            <Text
              style={[
                styles.bottomNavText,
                { color: theme.textSecondary },
                activeTab === 'listen' && [styles.bottomNavTextActive, { color: theme.pillMintText }],
              ]}
            >
              Listen
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.bottomNavItem,
              activeTab === 'queue' && [styles.bottomNavActive, { backgroundColor: theme.pillMintBg }],
            ]}
            onPress={() => setActiveTab('queue')}
            activeOpacity={0.8}
          >
            <ListMusic size={20} color={activeTab === 'queue' ? theme.pillMintText : theme.textSecondary} />
            <Text
              style={[
                styles.bottomNavText,
                { color: theme.textSecondary },
                activeTab === 'queue' && [styles.bottomNavTextActive, { color: theme.pillMintText }],
              ]}
            >
              Queue
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.bottomNavItem,
              activeTab === 'people' && [styles.bottomNavActive, { backgroundColor: theme.pillMintBg }],
            ]}
            onPress={() => setActiveTab('people')}
            activeOpacity={0.8}
          >
            <Users size={20} color={activeTab === 'people' ? theme.pillMintText : theme.textSecondary} />
            <Text
              style={[
                styles.bottomNavText,
                { color: theme.textSecondary },
                activeTab === 'people' && [styles.bottomNavTextActive, { color: theme.pillMintText }],
              ]}
            >
              People
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Animated Bottom Toast Notification */}
      {toastMessage && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              backgroundColor: isDark ? '#24242A' : '#191b23',
              bottom: isDesktop ? 30 : bottomPadding + 65,
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Info size={16} color="#60A5FA" />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

      {/* Direct-to-Storage Upload Modal */}
      <UploadModal
        visible={uploadModalVisible}
        roomId={room.id}
        onClose={() => setUploadModalVisible(false)}
        onSuccess={() => console.log('Song uploaded & queued')}
        onStartLiveBroadcast={async () => {
          try {
            await liveAudioStreamer.startSystemAudioBroadcast(room.id, socket);
            setIsLiveStreaming(true);
            showToast('🎙️ Live System Audio Broadcast is active!');
          } catch (err: any) {
            Alert.alert('Broadcast Error', err.message || 'Could not start audio broadcast.');
          }
        }}
      />

      {/* Custom Boutique Exit Confirmation Modal */}
      <ConfirmModal
        visible={confirmModalVisible}
        isHost={user.isHost}
        type="confirm_exit"
        roomCode={room.code}
        onClose={() => setConfirmModalVisible(false)}
        onConfirm={handleConfirmExit}
      />

      {/* Custom Boutique Party Ended Modal */}
      <ConfirmModal
        visible={endedModalVisible}
        type="room_ended"
        endReason={endReason}
        onClose={() => {
          setEndedModalVisible(false);
          onExit();
        }}
        onConfirm={() => {
          setEndedModalVisible(false);
          onExit();
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  topHeader: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  exitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(186, 26, 26, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  exitPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ba1a1a',
  },
  roomCodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  roomCodeLabel: {
    fontSize: 9,
    fontWeight: '800',
  },
  roomCodeValue: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  shareInviteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  shareInviteText: {
    fontSize: 12,
    fontWeight: '700',
  },
  membersChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  membersCountText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mainLayout: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    height: '100%',
  },
  desktopSidebar: {
    width: 240,
    borderRightWidth: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  sidebarNavList: {
    gap: 6,
  },
  sidebarNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  sidebarNavActive: {},
  sidebarNavText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sidebarNavTextActive: {
    fontWeight: '700',
  },
  sidebarFooter: {
    paddingTop: 16,
  },
  sidebarAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  sidebarAddBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  contentCanvas: {
    flex: 1,
    height: '100%',
    width: '100%',
  },
  scrollViewWrapper: {
    flex: 1,
    width: '100%',
  },
  canvasScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  floatingBottomDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginHorizontal: 24,
    borderRadius: 30,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  bottomNavItem: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  bottomNavActive: {},
  bottomNavText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  bottomNavTextActive: {
    fontWeight: '700',
  },
  toastContainer: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
    zIndex: 999,
    maxWidth: '90%',
  },
  toastText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});
