import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { Wifi, X, QrCode, Check, Smartphone, ArrowRight, Radio, Copy } from 'lucide-react-native';
import { useAppTheme } from '../context/ThemeContext';
import { setApiBaseUrl, getApiBaseUrl } from '../api/client';

interface Props {
  visible: boolean;
  roomCode?: string;
  onClose: () => void;
}

const PRESET_IPS = [
  { id: 'android', label: 'Android Hotspot', ip: '192.168.43.1', desc: 'Standard Android AP gateway' },
  { id: 'ios', label: 'iPhone Hotspot', ip: '172.20.10.1', desc: 'Standard iOS Personal Hotspot' },
  { id: 'lan', label: 'Local Wi-Fi Router', ip: '192.168.31.249', desc: 'Home or Office LAN IP' },
];

export const OfflineHotspotModal: React.FC<Props> = ({ visible, roomCode = 'ROOM', onClose }) => {
  const { isDark, theme } = useAppTheme();
  const [selectedIp, setSelectedIp] = useState('192.168.43.1');
  const [customIp, setCustomIp] = useState('');
  const [copied, setCopied] = useState(false);

  const activeIp = customIp.trim() || selectedIp;
  const joinUrl = `http://${activeIp}:4000/?room=${roomCode}&offline=1`;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(joinUrl)}&bgcolor=${isDark ? '12141a' : 'ffffff'}&color=${isDark ? 'ffffff' : '12141a'}&margin=10`;

  const handleApplyPreset = (ip: string) => {
    setSelectedIp(ip);
    setCustomIp('');
    setApiBaseUrl(`http://${ip}:4000`);
  };

  const handleApplyCustom = () => {
    if (customIp.trim()) {
      setApiBaseUrl(`http://${customIp.trim()}:4000`);
      Alert.alert('Applied', `Local Gateway set to http://${customIp.trim()}:4000`);
    }
  };

  const handleCopyLink = () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).clipboard) {
      (navigator as any).clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Wifi size={20} color="#22c55e" />
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Offline Hotspot Jamming</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Subtitle */}
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Zero internet required. Connect guests directly to the host's Wi-Fi hotspot with sub-2ms phase-lock sync.
          </Text>

          {/* QR Code Card */}
          <View style={[styles.qrContainer, { backgroundColor: theme.elevatedBg, borderColor: theme.cardBorder }]}>
            <img
              src={qrApiUrl}
              alt="Offline QR Code"
              style={{
                width: 170,
                height: 170,
                borderRadius: 12,
                display: 'block',
              }}
            />
            <View style={styles.qrLabelRow}>
              <Text style={[styles.qrLabel, { color: theme.textPrimary }]}>Room Code: <Text style={{ color: theme.accent, fontWeight: '800' }}>{roomCode}</Text></Text>
              <Text style={[styles.qrSub, { color: theme.textSecondary }]}>Gateway: {activeIp}:4000</Text>
            </View>
          </View>

          {/* Hotspot Presets */}
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Select Host Hotspot Gateway</Text>
          <View style={styles.presetRow}>
            {PRESET_IPS.map((preset) => {
              const isSelected = activeIp === preset.ip;
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[
                    styles.presetBtn,
                    { backgroundColor: theme.elevatedBg, borderColor: theme.cardBorder },
                    isSelected && { borderColor: '#22c55e', backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)' },
                  ]}
                  onPress={() => handleApplyPreset(preset.ip)}
                  activeOpacity={0.8}
                >
                  <View style={styles.presetTop}>
                    <Smartphone size={14} color={isSelected ? '#22c55e' : theme.textMuted} />
                    <Text style={[styles.presetTitle, { color: isSelected ? '#22c55e' : theme.textPrimary }]}>
                      {preset.label}
                    </Text>
                  </View>
                  <Text style={[styles.presetIp, { color: theme.textMuted }]}>{preset.ip}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Copy Link Button */}
          <TouchableOpacity
            style={[styles.copyButton, { backgroundColor: theme.elevatedBg, borderColor: theme.cardBorder }]}
            onPress={handleCopyLink}
            activeOpacity={0.8}
          >
            {copied ? <Check size={16} color="#22c55e" /> : <Copy size={16} color={theme.accent} />}
            <Text style={[styles.copyText, { color: copied ? '#22c55e' : theme.accent }]}>
              {copied ? 'Offline Link Copied!' : 'Copy Local Join Link'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 12, 18, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 32,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 17,
  },
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    gap: 10,
  },
  qrLabelRow: {
    alignItems: 'center',
    gap: 2,
  },
  qrLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  qrSub: {
    fontSize: 11,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  presetBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  presetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  presetTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  presetIp: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  copyText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
