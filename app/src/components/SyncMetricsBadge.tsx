import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DriftReport } from '../types';

interface Props {
  clockOffset: number;
  latency: number;
  driftReport: DriftReport;
  isHost: boolean;
}

export const SyncMetricsBadge: React.FC<Props> = ({ clockOffset, latency, driftReport, isHost }) => {
  const isHealthy = driftReport.driftMs < 300;

  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: isHealthy ? '#22c55e' : '#f59e0b' },
          ]}
        />
        <Text style={styles.badgeText}>
          {isHost ? 'HOST' : 'SYNCED'}
        </Text>
      </View>

      <View style={styles.metricsRow}>
        <Text style={styles.metricText}>
          RTT: <Text style={styles.metricValue}>{latency}ms</Text>
        </Text>
        <Text style={styles.divider}>•</Text>
        <Text style={styles.metricText}>
          Offset: <Text style={styles.metricValue}>{clockOffset > 0 ? `+${clockOffset}` : clockOffset}ms</Text>
        </Text>
        {!isHost && (
          <>
            <Text style={styles.divider}>•</Text>
            <Text style={styles.metricText}>
              Drift: <Text style={[styles.metricValue, { color: isHealthy ? '#a5b4fc' : '#fbbf24' }]}>{driftReport.driftMs}ms</Text>
            </Text>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 20,
    marginVertical: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    color: '#c7d2fe',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricText: {
    color: '#64748b',
    fontSize: 11,
  },
  metricValue: {
    color: '#94a3b8',
    fontWeight: '600',
  },
  divider: {
    color: '#475569',
    fontSize: 10,
  },
});
