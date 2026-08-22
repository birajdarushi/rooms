import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import {
  Settings,
  Activity,
  Wifi,
  Radio,
  Clock,
  LogOut,
  Trash2,
  ShieldCheck,
} from 'lucide-react-native';
import { setApiBaseUrl, getApiBaseUrl } from '../api/client';
import { DriftReport, HostStatusPayload } from '../types';

interface Props {
  isHost: boolean;
  roomCode: string;
  clockOffset: number;
  latency: number;
  driftReport: DriftReport;
  hostStatus: HostStatusPayload;
  onLeaveOrEnd: () => void;
}

export const SettingsView: React.FC<Props> = ({
  isHost,
  roomCode,
  clockOffset,
  latency,
  driftReport,
  hostStatus,
  onLeaveOrEnd,
}) => {
  const [customUrl, setCustomUrl] = useState(getApiBaseUrl());

  const handleSaveUrl = () => {
    if (customUrl.trim()) {
      setApiBaseUrl(customUrl.trim());
      Alert.alert('Updated', `Backend server set to: ${customUrl.trim()}`);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Sync Health Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Activity size={20} color="#0052cc" />
          <Text style={styles.cardTitle}>Real-Time Sync Engine</Text>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricVal}>{Math.round(latency)} ms</Text>
            <Text style={styles.metricLabel}>Round-Trip Latency</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricVal}>{Math.abs(Math.round(clockOffset))} ms</Text>
            <Text style={styles.metricLabel}>Clock Offset</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricVal}>{Math.abs(driftReport.driftMs || 0)} ms</Text>
            <Text style={styles.metricLabel}>Current Drift</Text>
          </View>
        </View>

        <View style={styles.syncStatusBadge}>
          <ShieldCheck size={14} color="#16a34a" />
          <Text style={styles.syncStatusText}>
            Continuous 10s heartbeat • Auto-corrects if drift &gt; 500ms
          </Text>
        </View>
      </View>

      {/* Backend Endpoint Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Wifi size={20} color="#0052cc" />
          <Text style={styles.cardTitle}>Server Endpoint</Text>
        </View>

        <Text style={styles.cardSub}>
          Connect mobile devices on the same Wi-Fi network or using a public tunnel URL.
        </Text>

        <TextInput
          style={styles.input}
          value={customUrl}
          onChangeText={setCustomUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="http://192.168.x.x:4000"
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveUrl} activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>Apply Server URL</Text>
        </TouchableOpacity>
      </View>

      {/* Party Actions */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <LogOut size={20} color={isHost ? '#ef4444' : '#64748b'} />
          <Text style={styles.cardTitle}>{isHost ? 'End Listening Party' : 'Leave Party'}</Text>
        </View>

        <Text style={styles.cardSub}>
          {isHost
            ? 'Ending the party will disconnect all listeners and immediately delete all uploaded audio from server storage.'
            : 'You will leave the session. You can rejoin anytime using the room code.'}
        </Text>

        <TouchableOpacity
          style={[styles.dangerBtn, !isHost && styles.neutralBtn]}
          onPress={onLeaveOrEnd}
          activeOpacity={0.85}
        >
          {isHost ? <Trash2 size={16} color="#ffffff" /> : <LogOut size={16} color="#ffffff" />}
          <Text style={styles.dangerBtnText}>
            {isHost ? 'End Party & Delete Files' : 'Leave Room'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 100,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 680,
    backgroundColor: '#F9F7F2',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E1D8',
    padding: 22,
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#191b23',
  },
  cardSub: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 14,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c3c6d6',
    paddingVertical: 14,
    marginBottom: 12,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0052cc',
  },
  metricLabel: {
    fontSize: 11,
    color: '#737685',
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E5E1D8',
  },
  syncStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  syncStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c3c6d6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#191b23',
    marginBottom: 12,
  },
  saveBtn: {
    backgroundColor: '#0052cc',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ba1a1a',
    paddingVertical: 12,
    borderRadius: 12,
  },
  neutralBtn: {
    backgroundColor: '#434654',
  },
  dangerBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
