import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Play, Pause, SkipForward, Lock } from 'lucide-react-native';
import { audioEngine } from '../services/AudioEngine';
import { Song, PlaybackStatus } from '../types';

interface Props {
  song: Song | null;
  playbackState: PlaybackStatus;
  isHost: boolean;
  onPlay: (songId: string, offsetSeconds: number) => void;
  onPause: (offsetSeconds: number) => void;
  onSeek: (offsetSeconds: number) => void;
  onSkip: () => void;
}

export const PlayerControls: React.FC<Props> = ({
  song,
  playbackState,
  isHost,
  onPlay,
  onPause,
  onSeek,
  onSkip,
}) => {
  const [position, setPosition] = useState<number>(0);
  const [duration, setDuration] = useState<number>(song?.duration || 0);

  const isPlaying = playbackState === 'playing';

  // Listen for audio engine status updates
  useEffect(() => {
    audioEngine.setOnStatusChange((status) => {
      if (typeof status.position === 'number' && Number.isFinite(status.position)) {
        setPosition(status.position);
      }
      if (typeof status.duration === 'number' && Number.isFinite(status.duration) && status.duration > 0) {
        setDuration(status.duration);
      }
    });

    if (song?.duration && Number.isFinite(song.duration)) {
      setDuration(song.duration);
    }
  }, [song]);

  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleTogglePlay = () => {
    if (!song) return;
    if (isPlaying) {
      onPause(position);
    } else {
      onPlay(song.id, position);
    }
  };

  const handleProgressBarPress = (event: any) => {
    if (!isHost || duration <= 0) return;
    const touchX = event?.nativeEvent?.locationX || 0;
    const barWidth = 320;
    const clickRatio = Math.max(0, Math.min(1, touchX / barWidth));
    const seekTarget = clickRatio * duration;
    setPosition(seekTarget);
    onSeek(seekTarget);
  };

  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;
  const safePercent = Number.isFinite(progressPercent)
    ? Math.min(100, Math.max(0, Math.round(progressPercent)))
    : 0;

  return (
    <View style={styles.container}>
      {/* Progress Bar */}
      <View style={styles.progressSection}>
        <TouchableOpacity
          activeOpacity={isHost ? 0.7 : 1}
          style={styles.progressBarBackground}
          onPress={handleProgressBarPress}
        >
          <View style={[styles.progressBarFill, { width: `${safePercent}%` }]} />
        </TouchableOpacity>

        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      </View>

      {/* Playback Action Buttons */}
      {isHost ? (
        <View style={styles.controlsRow}>
          <View style={{ width: 44 }} />

          {/* Main Play/Pause Button */}
          <TouchableOpacity
            style={[styles.playButton, !song && styles.disabledButton]}
            disabled={!song}
            onPress={handleTogglePlay}
          >
            {isPlaying ? (
              <Pause size={28} color="#ffffff" />
            ) : (
              <Play size={28} color="#ffffff" style={{ marginLeft: 3 }} />
            )}
          </TouchableOpacity>

          {/* Skip Button */}
          <TouchableOpacity
            style={[styles.skipButton, !song && styles.disabledButton]}
            disabled={!song}
            onPress={onSkip}
          >
            <SkipForward size={24} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.listenerBanner}>
          <Lock size={16} color="#818cf8" />
          <Text style={styles.listenerBannerText}>
            Playback synced to Host • Listen along
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    marginVertical: 10,
    alignItems: 'center',
  },
  progressSection: {
    width: '100%',
    maxWidth: 340,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 3,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    marginTop: 18,
  },
  playButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  skipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.4,
  },
  listenerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 18,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  listenerBannerText: {
    color: '#c7d2fe',
    fontSize: 13,
    fontWeight: '600',
  },
});
