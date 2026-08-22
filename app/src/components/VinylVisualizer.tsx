import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Song, PlaybackStatus } from '../types';

interface Props {
  song: Song | null;
  playbackState: PlaybackStatus;
}

export const VinylVisualizer: React.FC<Props> = ({ song, playbackState }) => {
  const spinValue = useRef(new Animated.Value(0)).current;
  const isPlaying = playbackState === 'playing';

  // Vinyl Rotation Animation
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;

    if (isPlaying) {
      animation = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 12000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      animation.start();
    } else {
      spinValue.stopAnimation();
    }

    return () => {
      if (animation) animation.stop();
    };
  }, [isPlaying, spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* Vinyl Disc with Grooves */}
      <View style={styles.discGlow}>
        <Animated.View style={[styles.disc, { transform: [{ rotate: spin }] }]}>
          <View style={styles.grooveOuter}>
            <View style={styles.grooveMiddle}>
              <View style={styles.grooveInner}>
                {/* Center Label */}
                <View style={styles.centerLabel}>
                  <Text style={styles.labelBrand}>ROOM</Text>
                  <View style={styles.centerHole} />
                </View>
              </View>
            </View>
          </View>
        </Animated.View>
      </View>

      {/* Audio Wave Visualizer Bars */}
      <View style={styles.waveContainer}>
        {[40, 75, 55, 95, 60, 85, 45, 90, 65, 80, 50, 70, 88, 62, 45].map((height, i) => (
          <View
            key={i}
            style={[
              styles.waveBar,
              {
                height: isPlaying ? height * 0.4 : 6,
                opacity: isPlaying ? 0.9 : 0.3,
                backgroundColor: i % 2 === 0 ? '#6366f1' : '#a855f7',
              },
            ]}
          />
        ))}
      </View>

      {/* Track Info */}
      <View style={styles.trackInfo}>
        <Text style={styles.title} numberOfLines={1}>
          {song ? song.title : 'No Song Playing'}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {song ? song.artist : 'Queue songs to start the party'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 18,
  },
  discGlow: {
    padding: 10,
    borderRadius: 140,
    shadowColor: '#818cf8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 25,
    elevation: 12,
  },
  disc: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#0f111a',
    borderWidth: 4,
    borderColor: '#1e2336',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grooveOuter: {
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grooveMiddle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grooveInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#818cf8',
  },
  labelBrand: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  centerHole: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#0b0d17',
    marginTop: 4,
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    marginTop: 20,
    gap: 4,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
  },
  trackInfo: {
    alignItems: 'center',
    marginTop: 14,
    paddingHorizontal: 24,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  artist: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
});
