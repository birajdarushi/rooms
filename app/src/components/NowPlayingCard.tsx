import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  useWindowDimensions,
  Animated,
  Easing,
  Platform,
  useColorScheme,
  PanResponder,
} from 'react-native';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Music2,
  Plus,
} from 'lucide-react-native';
import { Song, PlaybackStatus, QueueItem } from '../types';
import { audioEngine } from '../services/AudioEngine';
import { getTheme, getSongPalette, getAvatarColors } from '../constants/theme';
import { AudioWaveformScrubber } from './AudioWaveformScrubber';

interface Props {
  song: Song | null;
  queue: QueueItem[];
  playbackState: PlaybackStatus;
  isHost: boolean;
  memberCount: number;
  roomCode: string;
  userDisplayName: string;
  onPlay: (songId: string, offsetSeconds: number) => void;
  onPause: (offsetSeconds: number) => void;
  onSeek: (offsetSeconds: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onOpenUpload: () => void;
  onNavigateToQueue: () => void;
  onShowNotice?: (msg: string) => void;
}

export const NowPlayingCard: React.FC<Props> = ({
  song,
  queue,
  playbackState,
  isHost,
  memberCount,
  roomCode,
  userDisplayName,
  onPlay,
  onPause,
  onSeek,
  onNext,
  onPrevious,
  onOpenUpload,
  onNavigateToQueue,
  onShowNotice,
}) => {
  const [position, setPosition] = useState<number>(0);
  const [duration, setDuration] = useState<number>(song?.duration || 0);
  const [barWidth, setBarWidth] = useState<number>(330);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragPosition, setDragPosition] = useState<number>(0);

  const durationRef = useRef<number>(song?.duration || 0);
  const barWidthRef = useRef<number>(330);
  const isDraggingRef = useRef<boolean>(false);

  const isDarkMode = useColorScheme() === 'dark';
  const theme = getTheme(isDarkMode);

  const isPlaying = playbackState === 'playing';
  const palette = getSongPalette(song ? song.title + song.id : 'default');

  durationRef.current = duration;
  barWidthRef.current = barWidth;
  isDraggingRef.current = isDragging;

  // Breathing aura animation
  const glowAnim = useRef(new Animated.Value(0.85)).current;
  // Equalizer wave animations
  const eq1 = useRef(new Animated.Value(0.4)).current;
  const eq2 = useRef(new Animated.Value(1)).current;
  const eq3 = useRef(new Animated.Value(0.65)).current;
  const eq4 = useRef(new Animated.Value(0.85)).current;

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // PanResponder for smooth VLC/Spotify-style timeline scrubbing
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isHost && durationRef.current > 0,
      onMoveShouldSetPanResponder: () => isHost && durationRef.current > 0,
      onPanResponderGrant: (evt) => {
        setIsDragging(true);
        const touchX = Math.max(0, evt.nativeEvent.locationX);
        const width = barWidthRef.current || 330;
        const ratio = Math.max(0, Math.min(1, touchX / width));
        const target = ratio * durationRef.current;
        setDragPosition(target);
      },
      onPanResponderMove: (evt) => {
        const touchX = Math.max(0, evt.nativeEvent.locationX);
        const width = barWidthRef.current || 330;
        const ratio = Math.max(0, Math.min(1, touchX / width));
        const target = ratio * durationRef.current;
        setDragPosition(target);
      },
      onPanResponderRelease: async (evt) => {
        setIsDragging(false);
        const touchX = Math.max(0, evt.nativeEvent.locationX);
        const width = barWidthRef.current || 330;
        const ratio = Math.max(0, Math.min(1, touchX / width));
        const target = ratio * durationRef.current;
        setPosition(target);
        await audioEngine.seekTo(target);
        onSeek(target);
      },
    })
  ).current;

  useEffect(() => {
    if (isPlaying) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1.08,
            duration: 2200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.88,
            duration: 2200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ])
      ).start();

      // Equalizer bars animation
      const animateBar = (anim: Animated.Value, delay: number, dur: number) => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1,
              duration: dur,
              delay,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: 0.25,
              duration: dur,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: false,
            }),
          ])
        ).start();
      };
      animateBar(eq1, 0, 500);
      animateBar(eq2, 150, 450);
      animateBar(eq3, 300, 600);
      animateBar(eq4, 450, 550);
    } else {
      glowAnim.setValue(0.9);
      eq1.setValue(0.4);
      eq2.setValue(0.8);
      eq3.setValue(0.5);
      eq4.setValue(0.7);
    }
  }, [isPlaying]);

  useEffect(() => {
    audioEngine.setOnStatusChange((status) => {
      if (!isDraggingRef.current) {
        if (typeof status.position === 'number' && Number.isFinite(status.position)) {
          setPosition(status.position);
        }
        if (typeof status.duration === 'number' && Number.isFinite(status.duration) && status.duration > 0) {
          setDuration(status.duration);
        }
      }
    });

    if (song?.duration && Number.isFinite(song.duration)) {
      setDuration(song.duration);
    }

    // Media Session for Lock Screen / Notification shade
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'mediaSession' in navigator && song) {
      try {
        navigator.mediaSession.metadata = new (window as any).MediaMetadata({
          title: song.title || 'Room Track',
          artist: song.artist || 'Listening Party',
          album: `Room ${roomCode}`,
        });

        if (isHost) {
          navigator.mediaSession.setActionHandler('play', () => onPlay(song.id, position));
          navigator.mediaSession.setActionHandler('pause', () => onPause(position));
          navigator.mediaSession.setActionHandler('nexttrack', onNext);
          navigator.mediaSession.setActionHandler('previoustrack', onPrevious);
          navigator.mediaSession.setActionHandler('seekto', (details: any) => {
            if (details.seekTime !== undefined) onSeek(details.seekTime);
          });
        }
      } catch (e) {
        // ignore
      }
    }
  }, [song, isHost, position, roomCode]);

  const notifyListener = () => {
    if (onShowNotice) {
      onShowNotice('🎧 You are a listener in this room. Only the host can control playback.');
    }
  };

  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleTogglePlay = async () => {
    if (!isHost) {
      notifyListener();
      return;
    }
    if (!song) return;

    const currentPos = await audioEngine.getPosition();
    if (isPlaying) {
      await audioEngine.pause();
      onPause(currentPos);
    } else {
      // ⚡ INSTANT RESUME: Resume playback seamlessly from exact current stopped position
      await audioEngine.play();
      onPlay(song.id, currentPos);
    }
  };

  const handleFastForward = async () => {
    if (!isHost || !song || duration <= 0) return;
    const current = isDragging ? dragPosition : position;
    const target = Math.min(duration, current + 10);
    setPosition(target);
    await audioEngine.seekTo(target);
    onSeek(target);
  };

  const handleRewind = async () => {
    if (!isHost || !song || duration <= 0) return;
    const current = isDragging ? dragPosition : position;
    const target = Math.max(0, current - 10);
    setPosition(target);
    await audioEngine.seekTo(target);
    onSeek(target);
  };

  const currentDisplayPosition = isDragging ? dragPosition : position;
  const progressPercent = duration > 0 ? (currentDisplayPosition / duration) * 100 : 0;
  const safePercent = Number.isFinite(progressPercent)
    ? Math.min(100, Math.max(0, Math.round(progressPercent)))
    : 0;

  // Render overlapping member avatar chips
  const renderAvatars = () => {
    const letters = [(userDisplayName || 'Host').charAt(0).toUpperCase(), 'R', 'K'];
    const maxShow = 3;
    return (
      <View style={styles.avatarCluster}>
        {letters.slice(0, Math.min(memberCount, maxShow)).map((char, idx) => {
          const avatarColors = getAvatarColors(char + idx, isDarkMode);
          return (
            <View
              key={idx}
              style={[
                styles.avatarBubble,
                {
                  backgroundColor: avatarColors.bg,
                  borderColor: theme.bg,
                  marginLeft: idx > 0 ? -8 : 0,
                },
              ]}
            >
              <Text style={[styles.avatarLetter, { color: avatarColors.text }]}>{char}</Text>
            </View>
          );
        })}
        {memberCount > maxShow && (
          <View style={[styles.avatarBubble, { backgroundColor: theme.cardRaised, borderColor: theme.bg, marginLeft: -8 }]}>
            <Text style={[styles.avatarMoreText, { color: theme.textSecondary }]}>+{memberCount - maxShow}</Text>
          </View>
        )}
      </View>
    );
  };

  // Preview next 2 songs from queue
  const upNextList = queue.filter((item) => item.songId !== song?.id).slice(0, 2);

  return (
    <View style={[styles.container, { maxWidth: isDesktop ? 460 : 390, paddingBottom: isDesktop ? 8 : 24 }]}>
      {/* 1. Header Row */}
      <View style={[styles.topbar, isDesktop && { marginBottom: 10 }]}>
        <View style={styles.roomCodeGroup}>
          <View style={[styles.pulsingDot, { backgroundColor: theme.pillMintText }]} />
          <View>
            <Text style={[styles.roomLabel, { color: theme.textMuted }]}>ROOM</Text>
            <Text style={[styles.roomCodeText, { color: theme.textPrimary }]}>{roomCode}</Text>
          </View>
        </View>

        {/* Member Avatars */}
        {renderAvatars()}
      </View>

      {/* 2. Hero Artwork Stage */}
      <View style={[styles.stage, isDesktop && { marginBottom: 10 }]}>
        <View style={[styles.artWrap, isDesktop && { width: 170, height: 170, marginBottom: 12 }]}>
          {/* Dynamic Breathing Glow Aura */}
          <Animated.View
            style={[
              styles.artGlow,
              {
                backgroundColor: palette.glow,
                transform: [{ scale: glowAnim }],
              },
              isDesktop && { width: 200, height: 200, borderRadius: 100 },
            ]}
          />

          {/* Artwork Card */}
          <View
            style={[
              styles.artCard,
              {
                backgroundColor: palette.primary,
                borderColor: theme.cardBorder,
              },
              isDesktop && { width: 170, height: 170, borderRadius: 20 },
            ]}
          >
            {song?.artworkUrl ? (
              <Image source={{ uri: song.artworkUrl }} style={styles.artImage} resizeMode="cover" />
            ) : (
              <View style={styles.musicPlaceholder}>
                <Music2 size={isDesktop ? 48 : 64} color={palette.textColor} strokeWidth={1.8} />
              </View>
            )}
          </View>
        </View>

        {/* Title & Artist */}
        <Text style={[styles.trackTitle, { color: theme.textPrimary }, isDesktop && { fontSize: 20, marginBottom: 2 }]} numberOfLines={1}>
          {song?.title || 'No Track Playing'}
        </Text>
        <Text style={[styles.trackArtist, { color: theme.textSecondary }, isDesktop && { fontSize: 13 }]} numberOfLines={1}>
          {song?.artist || (isHost ? 'Add tracks below to start' : 'Waiting for host')}
          {' · '}
          <Text style={{ color: theme.textMuted }}>
            {isHost ? 'Host Session' : 'Listening Party'}
          </Text>
        </Text>

        {/* Sync Pill with live equalizer bars */}
        <View style={[styles.syncPill, { backgroundColor: theme.pillMintBg, borderColor: theme.cardBorder }, isDesktop && { marginTop: 8, paddingVertical: 4, paddingHorizontal: 10 }]}>
          <View style={styles.equalizerRow}>
            <Animated.View style={[styles.eqBar, { backgroundColor: theme.pillMintText, transform: [{ scaleY: eq1 }] }]} />
            <Animated.View style={[styles.eqBar, { backgroundColor: theme.pillMintText, transform: [{ scaleY: eq2 }] }]} />
            <Animated.View style={[styles.eqBar, { backgroundColor: theme.pillMintText, transform: [{ scaleY: eq3 }] }]} />
            <Animated.View style={[styles.eqBar, { backgroundColor: theme.pillMintText, transform: [{ scaleY: eq4 }] }]} />
          </View>
          <Text style={[styles.syncPillText, { color: theme.pillMintText }, isDesktop && { fontSize: 11 }]}>
            {memberCount} {memberCount === 1 ? 'person' : 'people'}, same beat
          </Text>
        </View>
      </View>

      {/* 3. Real Processed Audio Waveform Scrubber with Blue Playhead Line */}
      <AudioWaveformScrubber
        song={song}
        position={position}
        duration={duration}
        isHost={isHost}
        isPlaying={isPlaying}
        onSeek={async (targetSec) => {
          setPosition(targetSec);
          await audioEngine.seekTo(targetSec);
          onSeek(targetSec);
        }}
      />

      {/* 4. Playback Controls (VLC / Spotify Full Suite: Prev, -10s, Play/Pause, +10s, Next) */}
      <View style={[styles.controlsRow, isDesktop && { marginBottom: 10, gap: 12 }]}>
        {/* Previous Song */}
        <TouchableOpacity
          style={[
            styles.ctlBtn,
            { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
            !song && styles.disabledBtn,
            isDesktop && { width: 38, height: 38, borderRadius: 19 },
          ]}
          onPress={isHost ? onPrevious : notifyListener}
          activeOpacity={0.75}
        >
          <SkipBack size={isDesktop ? 16 : 18} color={theme.textSecondary} />
        </TouchableOpacity>

        {/* Rewind 10 Seconds */}
        <TouchableOpacity
          style={[
            styles.ctlBtn,
            { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
            !song && styles.disabledBtn,
            isDesktop && { width: 38, height: 38, borderRadius: 19 },
          ]}
          onPress={isHost ? handleRewind : notifyListener}
          activeOpacity={0.75}
        >
          <RotateCcw size={isDesktop ? 15 : 17} color={theme.textSecondary} />
        </TouchableOpacity>

        {/* Big Play / Pause */}
        <TouchableOpacity
          style={[
            styles.playBtn,
            {
              backgroundColor: palette.primary,
              shadowColor: palette.primary,
            },
            !song && styles.disabledBtn,
            isDesktop && { width: 56, height: 56, borderRadius: 28 },
          ]}
          onPress={handleTogglePlay}
          activeOpacity={0.85}
        >
          {isPlaying ? (
            <Pause size={isDesktop ? 24 : 28} color={palette.textColor} />
          ) : (
            <Play size={isDesktop ? 24 : 28} color={palette.textColor} style={{ marginLeft: 3 }} />
          )}
        </TouchableOpacity>

        {/* Forward 10 Seconds */}
        <TouchableOpacity
          style={[
            styles.ctlBtn,
            { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
            !song && styles.disabledBtn,
            isDesktop && { width: 38, height: 38, borderRadius: 19 },
          ]}
          onPress={isHost ? handleFastForward : notifyListener}
          activeOpacity={0.75}
        >
          <RotateCw size={isDesktop ? 15 : 17} color={theme.textSecondary} />
        </TouchableOpacity>

        {/* Next Song */}
        <TouchableOpacity
          style={[
            styles.ctlBtn,
            { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
            !song && styles.disabledBtn,
            isDesktop && { width: 38, height: 38, borderRadius: 19 },
          ]}
          onPress={isHost ? onNext : notifyListener}
          activeOpacity={0.75}
        >
          <SkipForward size={isDesktop ? 16 : 18} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* 5. Up Next Preview Section */}
      <View style={[styles.queueSection, isDesktop && { marginTop: 2 }]}>
        <View style={[styles.sectionLabelRow, isDesktop && { marginBottom: 4 }]}>
          <Text style={[styles.sectionLabelTitle, { color: theme.textMuted }, isDesktop && { fontSize: 10 }]}>UP NEXT</Text>
          <TouchableOpacity onPress={onNavigateToQueue} activeOpacity={0.7}>
            <Text style={[styles.seeQueueLink, { color: palette.primary }, isDesktop && { fontSize: 11 }]}>See queue</Text>
          </TouchableOpacity>
        </View>

        {upNextList.map((item) => {
          const itemPalette = getSongPalette(item.song.title + item.song.id);
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.queueItemCard,
                { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
                isDesktop && { padding: 7, marginBottom: 5, borderRadius: 10 },
              ]}
              onPress={() => isHost && onPlay(item.song.id, 0)}
              activeOpacity={isHost ? 0.75 : 1}
            >
              <View style={[styles.queueThumb, { backgroundColor: itemPalette.primary }, isDesktop && { width: 30, height: 30, borderRadius: 8 }]}>
                <Music2 size={isDesktop ? 14 : 16} color={itemPalette.textColor} />
              </View>
              <View style={styles.queueMeta}>
                <Text style={[styles.queueTitle, { color: theme.textPrimary }, isDesktop && { fontSize: 12 }]} numberOfLines={1}>
                  {item.song.title}
                </Text>
                <Text style={[styles.queueArtist, { color: theme.textSecondary }, isDesktop && { fontSize: 10 }]} numberOfLines={1}>
                  {item.song.artist || 'Unknown Artist'}
                </Text>
              </View>
              <View style={[styles.queueAddedBadge, { backgroundColor: theme.cardRaised }, isDesktop && { paddingHorizontal: 6, paddingVertical: 2 }]}>
                <Text style={[styles.queueAddedText, { color: theme.textSecondary }, isDesktop && { fontSize: 10 }]}>{item.addedBy || 'Host'}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Dashed Add Song Trigger */}
        {isHost && (
          <TouchableOpacity
            style={[
              styles.addBarDashed,
              { borderColor: theme.strokeStrong },
              isDesktop && { paddingVertical: 10, marginTop: 4, borderRadius: 12 },
            ]}
            onPress={onOpenUpload}
            activeOpacity={0.8}
          >
            <Plus size={isDesktop ? 14 : 16} color={theme.textSecondary} />
            <Text style={[styles.addBarText, { color: theme.textSecondary }, isDesktop && { fontSize: 12 }]}>Add a song to the queue</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    width: '100%',
    paddingHorizontal: 4,
  },
  roomCodeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 3,
  },
  roomLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  roomCodeText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  avatarCluster: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  avatarLetter: {
    fontSize: 12,
    fontWeight: '800',
  },
  avatarMoreText: {
    fontSize: 10,
    fontWeight: '700',
  },
  stage: {
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  artWrap: {
    width: 238,
    height: 238,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 22,
  },
  artGlow: {
    position: 'absolute',
    width: 270,
    height: 270,
    borderRadius: 135,
  },
  artCard: {
    width: 238,
    height: 238,
    borderRadius: 26,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 10,
    borderWidth: 1,
  },
  artImage: {
    width: '100%',
    height: '100%',
  },
  musicPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  trackArtist: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 16,
  },
  equalizerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2.5,
    height: 12,
  },
  eqBar: {
    width: 2.5,
    height: 12,
    borderRadius: 2,
  },
  syncPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressWrap: {
    width: '100%',
    marginVertical: 18,
    paddingHorizontal: 4,
  },
  progressBar: {
    height: 6,
    borderRadius: 6,
    position: 'relative',
    justifyContent: 'center',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
    position: 'relative',
  },
  progressKnob: {
    position: 'absolute',
    right: -6,
    top: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 3,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    marginBottom: 28,
  },
  ctlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
  disabledBtn: {
    opacity: 0.4,
  },
  queueSection: {
    width: '100%',
    marginTop: 8,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionLabelTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  seeQueueLink: {
    fontSize: 12,
    fontWeight: '700',
  },
  queueItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    padding: 10,
    marginBottom: 9,
    borderWidth: 1,
  },
  queueThumb: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueMeta: {
    flex: 1,
    minWidth: 0,
  },
  queueTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  queueArtist: {
    fontSize: 11,
  },
  queueAddedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  queueAddedText: {
    fontSize: 10,
    fontWeight: '700',
  },
  addBarDashed: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 18,
    paddingVertical: 14,
  },
  addBarText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
