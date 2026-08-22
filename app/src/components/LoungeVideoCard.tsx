import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Volume2, VolumeX, Play, Pause, Sparkles } from 'lucide-react-native';
import { useAppTheme } from '../context/ThemeContext';
import { getApiBaseUrl } from '../api/client';

export const LoungeVideoCard: React.FC = () => {
  const { isDark, theme } = useAppTheme();
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<any>(null);

  const videoUrl = `${getApiBaseUrl()}/uploads/waveRooms_promo.mp4`;

  const toggleMute = () => {
    if (Platform.OS === 'web' && videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const togglePlay = () => {
    if (Platform.OS === 'web' && videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
      {/* Top Banner Tag */}
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: theme.pillBlueBg }]}>
          <Sparkles size={13} color={theme.accent} />
          <Text style={[styles.badgeText, { color: theme.accent }]}>WaveRooms Experience</Text>
        </View>
      </View>

      {/* Video Viewport */}
      <View style={styles.videoWrapper}>
        {Platform.OS === 'web' ? (
          <video
            ref={videoRef}
            src={videoUrl}
            autoPlay
            muted={isMuted}
            loop
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              borderRadius: 14,
            }}
          />
        ) : (
          <View style={[styles.mobileFallback, { backgroundColor: '#000' }]}>
            <Text style={{ color: '#fff' }}>WaveRooms Video</Text>
          </View>
        )}

        {/* Video Overlay Controls */}
        <View style={styles.controlsOverlay}>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={togglePlay}
            activeOpacity={0.8}
          >
            {isPlaying ? (
              <Pause size={14} color="#ffffff" />
            ) : (
              <Play size={14} color="#ffffff" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlBtn}
            onPress={toggleMute}
            activeOpacity={0.8}
          >
            {isMuted ? (
              <VolumeX size={14} color="#ffffff" />
            ) : (
              <Volume2 size={14} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  videoWrapper: {
    width: '100%',
    height: 190,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0a0a0c',
  },
  mobileFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    gap: 6,
    zIndex: 10,
  },
  controlBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    padding: 7,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
