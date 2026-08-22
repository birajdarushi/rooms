import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Radio, Square, Volume2 } from 'lucide-react-native';
import { useAppTheme } from '../context/ThemeContext';
import { liveAudioStreamer } from '../services/LiveAudioStreamer';

interface Props {
  isHost: boolean;
  roomId: string;
  socket: any;
  onStop: () => void;
}

export const LiveStreamBanner: React.FC<Props> = ({ isHost, roomId, socket, onStop }) => {
  const { isDark, theme } = useAppTheme();
  const [volumeLevel, setVolumeLevel] = useState(0);

  useEffect(() => {
    liveAudioStreamer.setOnVolumeLevel((level) => {
      setVolumeLevel(level);
    });

    return () => {
      liveAudioStreamer.setOnVolumeLevel(() => {});
    };
  }, []);

  const handleStop = () => {
    liveAudioStreamer.stopBroadcast(roomId, socket);
    onStop();
  };

  const bars = [0.3, 0.6, 0.9, 0.4, 0.8, 1.0, 0.5, 0.7];

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#1C131D' : '#FDF2F4', borderColor: '#ef4444' }]}>
      <View style={styles.leftRow}>
        <View style={styles.liveBadge}>
          <View style={styles.redDot} />
          <Text style={styles.liveText}>LIVE BROADCAST</Text>
        </View>

        {/* Live Audio VU Level Bars */}
        <View style={styles.vuBarsRow}>
          {bars.map((weight, i) => {
            const dynamicHeight = Math.max(4, Math.round(volumeLevel * weight * 22));
            return (
              <View
                key={i}
                style={[
                  styles.vuBar,
                  {
                    height: dynamicHeight,
                    backgroundColor: volumeLevel > 0.1 ? '#ef4444' : theme.textMuted,
                  },
                ]}
              />
            );
          })}
        </View>
      </View>

      {isHost && (
        <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.8}>
          <Square size={12} color="#ffffff" fill="#ffffff" />
          <Text style={styles.stopBtnText}>End Stream</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginVertical: 10,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  redDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  liveText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  vuBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 22,
  },
  vuBar: {
    width: 3,
    borderRadius: 1.5,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  stopBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
