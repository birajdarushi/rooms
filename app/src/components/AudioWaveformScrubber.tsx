import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  PanResponder,
} from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { Song } from '../types';

interface Props {
  song: Song | null;
  position: number;
  duration: number;
  isHost: boolean;
  isPlaying: boolean;
  onSeek: (seconds: number) => void;
}

const TOTAL_BARS = 96;
const waveformCache = new Map<string, number[]>();

export const AudioWaveformScrubber: React.FC<Props> = ({
  song,
  position,
  duration,
  isHost,
  isPlaying,
  onSeek,
}) => {
  const { isDark, theme } = useAppTheme();
  const [peaks, setPeaks] = useState<number[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const barContainerRef = useRef<any>(null);
  const containerWidthRef = useRef<number>(360);

  const currentDisplayPosition = isDragging && dragPosition !== null ? dragPosition : position;
  const safeDuration = duration > 0 ? duration : (song?.duration && song.duration > 0 ? song.duration : 1);
  const progressRatio = Math.max(0, Math.min(1, currentDisplayPosition / safeDuration));
  const progressPercent = progressRatio * 100;

  // 1. Process real audio waveform data using Web Audio API
  useEffect(() => {
    if (!song) {
      setPeaks(generateFallbackPeaks(TOTAL_BARS));
      return;
    }

    if (waveformCache.has(song.id)) {
      setPeaks(waveformCache.get(song.id)!);
      return;
    }

    // Set fallback immediately while decoding
    const initialFallback = generateProceduralPeaks(song.title + song.artist, TOTAL_BARS);
    setPeaks(initialFallback);

    if (Platform.OS === 'web' && typeof window !== 'undefined' && song.storageUrl) {
      let isCancelled = false;

      const decodeAudio = async () => {
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (!AudioCtx) return;

          const response = await fetch(song.storageUrl);
          if (!response.ok) return;

          const arrayBuffer = await response.arrayBuffer();
          const audioCtx = new AudioCtx();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

          if (isCancelled) {
            audioCtx.close().catch(() => {});
            return;
          }

          const channelData = audioBuffer.getChannelData(0);
          const totalSamples = channelData.length;
          const blockSize = Math.floor(totalSamples / TOTAL_BARS);
          const computedPeaks: number[] = [];

          for (let i = 0; i < TOTAL_BARS; i++) {
            const start = i * blockSize;
            let sum = 0;
            const step = Math.max(1, Math.floor(blockSize / 25)); // Sample 25 points per bar slice
            let count = 0;

            for (let j = 0; j < blockSize; j += step) {
              const val = channelData[start + j] || 0;
              sum += val * val;
              count++;
            }

            const rms = Math.sqrt(sum / (count || 1));
            computedPeaks.push(rms);
          }

          // Normalize peaks between 0.12 (min height) and 1.0 (max peak)
          const maxPeak = Math.max(...computedPeaks, 0.001);
          const normalized = computedPeaks.map((p) => {
            const ratio = p / maxPeak;
            return Math.max(0.12, Math.min(1.0, ratio));
          });

          waveformCache.set(song.id, normalized);
          if (!isCancelled) {
            setPeaks(normalized);
          }
          audioCtx.close().catch(() => {});
        } catch (e) {
          console.warn('[Waveform] Fallback used for audio waveform:', e);
        }
      };

      decodeAudio();

      return () => {
        isCancelled = true;
      };
    }
  }, [song?.id, song?.storageUrl]);

  // Touch / Mobile PanResponder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isHost,
      onMoveShouldSetPanResponder: () => isHost,
      onPanResponderGrant: (evt) => {
        setIsDragging(true);
        handleSeekEvent(evt.nativeEvent.pageX, false);
      },
      onPanResponderMove: (evt) => {
        handleSeekEvent(evt.nativeEvent.pageX, false);
      },
      onPanResponderRelease: (evt) => {
        handleSeekEvent(evt.nativeEvent.pageX, true);
      },
    })
  ).current;

  const handleSeekEvent = (pageX: number, isFinal: boolean) => {
    if (!isHost || safeDuration <= 0) return;
    if (barContainerRef.current?.measure) {
      barContainerRef.current.measure((x: number, y: number, width: number, height: number, pageLeft: number) => {
        const touchX = Math.max(0, Math.min(width, pageX - pageLeft));
        const ratio = touchX / width;
        const target = ratio * safeDuration;
        setDragPosition(target);

        if (isFinal) {
          setIsDragging(false);
          setDragPosition(null);
          onSeek(target);
        }
      });
    }
  };

  const formatTime = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <View style={styles.container}>
      {/* Waveform Visualization Canvas */}
      <View
        ref={barContainerRef}
        style={[styles.waveformCanvas, { backgroundColor: isDark ? '#12141A' : '#EDE8DF' }]}
        onLayout={(e) => {
          containerWidthRef.current = e.nativeEvent.layout.width;
        }}
        {...(Platform.OS !== 'web' && isHost ? panResponder.panHandlers : {})}
      >
        {/* Render Waveform Amplitude Bars */}
        <View style={styles.barsContainer}>
          {peaks.map((peak, index) => {
            const barProgress = (index / TOTAL_BARS) * 100;
            const isPlayed = barProgress <= progressPercent;

            return (
              <View
                key={index}
                style={[
                  styles.bar,
                  {
                    height: Math.max(6, Math.round(peak * 54)),
                    backgroundColor: isPlayed
                      ? (isDark ? '#ffffff' : '#191b23')
                      : (isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(25, 27, 35, 0.25)'),
                  },
                ]}
              />
            );
          })}
        </View>

        {/* ⚡ Vertical Blue Accent Playhead Line with Indicator Pin */}
        <View
          style={[
            styles.playheadLine,
            {
              left: `${progressPercent}%`,
              backgroundColor: '#0066FF',
              shadowColor: '#0066FF',
            },
          ]}
        >
          {/* Top Pin Indicator */}
          <View style={[styles.playheadTopPin, { backgroundColor: '#0066FF' }]} />
          {/* Bottom Pin Indicator */}
          <View style={[styles.playheadBottomPin, { backgroundColor: '#0066FF' }]} />
        </View>

        {/* Web Native Invisible Overlay Slider for 100% Reliable Dragging & Seeking */}
        {Platform.OS === 'web' && isHost && (
          <input
            type="range"
            min={0}
            max={safeDuration}
            step={0.1}
            value={currentDisplayPosition}
            onMouseDown={() => setIsDragging(true)}
            onTouchStart={() => setIsDragging(true)}
            onChange={(e: any) => {
              const val = parseFloat(e.target.value);
              setDragPosition(val);
            }}
            onMouseUp={(e: any) => {
              const val = parseFloat(e.target.value);
              setIsDragging(false);
              setDragPosition(null);
              onSeek(val);
            }}
            onTouchEnd={(e: any) => {
              const val = parseFloat(e.target.value);
              setIsDragging(false);
              setDragPosition(null);
              onSeek(val);
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer',
              zIndex: 20,
              margin: 0,
              padding: 0,
            }}
          />
        )}
      </View>

      {/* Timestamp Row */}
      <View style={styles.timeRow}>
        <Text style={[styles.timeLabel, { color: isDragging ? '#0066FF' : theme.textMuted }]}>
          {formatTime(currentDisplayPosition)}
        </Text>
        <Text style={[styles.timeLabel, { color: theme.textMuted }]}>
          {formatTime(safeDuration)}
        </Text>
      </View>
    </View>
  );
};

// Generates smooth acoustic procedural peaks based on string hash
function generateProceduralPeaks(seedStr: string, count: number): number[] {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }

  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 4;
    const wave1 = Math.sin(angle + (hash % 10)) * 0.35;
    const wave2 = Math.cos(angle * 2.5 + (hash % 7)) * 0.25;
    const wave3 = Math.sin(angle * 0.6) * 0.2;
    const norm = Math.abs(wave1 + wave2 + wave3) + 0.2;
    peaks.push(Math.max(0.12, Math.min(1.0, norm)));
  }
  return peaks;
}

function generateFallbackPeaks(count: number): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    const val = 0.25 + Math.sin(i * 0.15) * 0.2;
    peaks.push(Math.max(0.15, Math.min(0.8, val)));
  }
  return peaks;
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 8,
  },
  waveformCanvas: {
    width: '100%',
    height: 72,
    borderRadius: 12,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '100%',
    width: '100%',
    paddingHorizontal: 2,
  },
  bar: {
    width: 2,
    borderRadius: 1,
    marginHorizontal: 0.5,
  },
  playheadLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    zIndex: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 6,
  },
  playheadTopPin: {
    position: 'absolute',
    top: 0,
    left: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  playheadBottomPin: {
    position: 'absolute',
    bottom: 0,
    left: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
