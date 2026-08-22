import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { HostStatusPayload } from '../types';

interface Props {
  hostStatus: HostStatusPayload;
}

export const GracePeriodBanner: React.FC<Props> = ({ hostStatus }) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(hostStatus.gracePeriodSeconds || 25);

  useEffect(() => {
    if (hostStatus.isHostConnected || !hostStatus.gracePeriodEndsAt) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((hostStatus.gracePeriodEndsAt! - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    }, 1000);

    return () => clearInterval(interval);
  }, [hostStatus]);

  if (hostStatus.isHostConnected) return null;

  return (
    <View style={styles.banner}>
      <AlertTriangle size={18} color="#f59e0b" />
      <Text style={styles.bannerText}>
        Host disconnected! Reconnecting... Room ends in{' '}
        <Text style={styles.countdown}>{secondsRemaining}s</Text>
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#f59e0b',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginHorizontal: 20,
    marginVertical: 6,
    gap: 10,
  },
  bannerText: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  countdown: {
    fontWeight: '800',
    color: '#ffffff',
  },
});
