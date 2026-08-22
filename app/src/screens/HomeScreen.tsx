import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { ArrowRight, Settings, Headphones, Radio, Users, ClipboardPaste, Wifi } from 'lucide-react-native';
import { api, setApiBaseUrl, getApiBaseUrl } from '../api/client';
import { Room, UserSession } from '../types';
import { saveSession } from '../services/SessionStorage';
import { useAppTheme } from '../context/ThemeContext';
import { LoungeVideoCard } from '../components/LoungeVideoCard';
import { OfflineHotspotModal } from '../components/OfflineHotspotModal';

interface Props {
  onEnterRoom: (room: Room, user: UserSession) => void;
}

export const HomeScreen: React.FC<Props> = ({ onEnterRoom }) => {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '']);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState(getApiBaseUrl());

  const { isDark, theme } = useAppTheme();
  const scrollViewRef = useRef<ScrollView>(null);

  const digitInputRefs = [
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
  ];

  const populateCode = (raw: string) => {
    let text = raw.trim();
    // If a full invite link or query parameter is pasted
    if (text.includes('?')) {
      try {
        const urlPart = text.includes('://') ? text : `https://x.com/${text.startsWith('?') ? text : '?' + text}`;
        const parsed = new URL(urlPart);
        const paramCode = parsed.searchParams.get('room') || parsed.searchParams.get('join') || parsed.searchParams.get('code');
        if (paramCode) text = paramCode;
      } catch (e) {}
    }

    const clean = text.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 5);
    const newDigits = ['', '', '', '', ''];
    for (let i = 0; i < clean.length; i++) {
      newDigits[i] = clean[i];
    }
    setDigits(newDigits);
    setRoomCode(clean);

    if (clean.length > 0) {
      const focusIndex = Math.min(4, clean.length);
      digitInputRefs[focusIndex].current?.focus();
    }
  };

  // Auto-detect invite link with ?room=CODE or ?join=CODE
  React.useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const codeParam = urlParams.get('room') || urlParams.get('join') || urlParams.get('code');
        if (codeParam && codeParam.trim()) {
          const clean = codeParam.trim().toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 5);
          if (clean.length > 0) {
            setInviteCode(clean);
            setActiveTab('join');
            populateCode(clean);
          }
        }
      } catch (e) {
        console.warn('Could not parse invite link:', e);
      }
    }
  }, []);

  const handleInputFocus = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 200);
  };

  const handlePasteClipboard = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).clipboard?.readText) {
        const text = await (navigator as any).clipboard.readText();
        if (text) populateCode(text);
      }
    } catch (e) {
      console.warn('Clipboard read failed:', e);
    }
  };

  const handleDigitChange = (val: string, index: number) => {
    // If user pasted multi-character code or full URL into a box
    if (val.length > 1) {
      populateCode(val);
      return;
    }

    const clean = val.toUpperCase().replace(/[^0-9A-Z]/g, '');
    const newDigits = [...digits];
    newDigits[index] = clean;
    setDigits(newDigits);
    const fullCode = newDigits.join('');
    setRoomCode(fullCode);

    if (clean && index < 4) {
      digitInputRefs[index + 1].current?.focus();
    }
  };

  const handleDigitKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      digitInputRefs[index - 1].current?.focus();
    }
  };

  const handleCreateRoom = async () => {
    const name = displayName.trim() || 'Host';
    try {
      setIsLoading(true);
      const res = await api.createRoom(name);
      setIsLoading(false);
      await saveSession({
        token: res.token,
        userId: res.user.userId,
        displayName: res.user.displayName,
        roomId: res.room.id,
        roomCode: res.room.code,
        isHost: res.user.isHost,
        serverUrl: getApiBaseUrl(),
      });
      onEnterRoom(res.room, res.user);
    } catch (err: any) {
      setIsLoading(false);
      Alert.alert('Error', err.message || 'Failed to create room.');
    }
  };

  const handleJoinRoom = async () => {
    const code = (roomCode || digits.join('')).trim();
    if (!code) {
      Alert.alert('Missing Code', 'Please enter your 5-character room code.');
      return;
    }
    const name = displayName.trim() || 'Listener';
    try {
      setIsLoading(true);
      const res = await api.joinRoom(code, name);
      setIsLoading(false);
      await saveSession({
        token: res.token,
        userId: res.user.userId,
        displayName: res.user.displayName,
        roomId: res.room.id,
        roomCode: res.room.code,
        isHost: res.user.isHost,
        serverUrl: getApiBaseUrl(),
      });
      onEnterRoom(res.room, res.user);
    } catch (err: any) {
      setIsLoading(false);
      Alert.alert('Error', err.message || 'Failed to join room.');
    }
  };

  const handleSaveServerUrl = () => {
    if (customServerUrl.trim()) {
      setApiBaseUrl(customServerUrl.trim());
      setShowConfig(false);
      Alert.alert('Updated', `Server URL set to ${customServerUrl.trim()}`);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      style={[styles.container, { backgroundColor: theme.bg }]}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Header */}
        <View style={styles.topHeaderRow}>
          <Text style={[styles.brandSubtitle, { color: theme.textPrimary }]}>Midnight Jazz Lounge</Text>
          <TouchableOpacity
            style={[styles.offlineHeaderBtn, { backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)', borderColor: '#22c55e' }]}
            onPress={() => setShowOfflineModal(true)}
            activeOpacity={0.8}
          >
            <Wifi size={13} color="#22c55e" />
            <Text style={styles.offlineHeaderBtnText}>Offline Hotspot</Text>
          </TouchableOpacity>
        </View>

        {/* 🎬 WaveRooms Lounge Video Autoplayer */}
        <LoungeVideoCard />

        {/* Offline Hotspot Modal */}
        <OfflineHotspotModal
          visible={showOfflineModal}
          roomCode={roomCode || 'ROOM'}
          onClose={() => setShowOfflineModal(false)}
        />

        {/* Bento Main Card */}
        <View style={[styles.mainCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
          {/* Top Graphic Icon */}
          <View style={[styles.iconCircle, { backgroundColor: theme.pillBlueBg }]}>
            <Headphones size={32} color={theme.accent} />
          </View>

          <Text style={[styles.cardHeading, { color: theme.textPrimary }]}>
            {activeTab === 'create' ? 'Host a Listening Party' : 'Join a Listening Party'}
          </Text>
          <Text style={[styles.cardSubtext, { color: theme.textSecondary }]}>
            {activeTab === 'create'
              ? 'Upload tracks, manage queue, and sync audio with friends in real time.'
              : 'Enter your name and the 5-character code to join the party.'}
          </Text>

          {/* Segmented Mode Selector */}
          <View style={[styles.tabContainer, { backgroundColor: theme.elevatedBg }]}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'create' && [styles.activeTab, { backgroundColor: theme.cardBg }]]}
              onPress={() => setActiveTab('create')}
              activeOpacity={0.8}
            >
              <Radio size={16} color={activeTab === 'create' ? theme.accent : theme.textMuted} />
              <Text style={[styles.tabText, { color: theme.textMuted }, activeTab === 'create' && { color: theme.accent, fontWeight: '700' }]}>
                Host Room
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'join' && [styles.activeTab, { backgroundColor: theme.cardBg }]]}
              onPress={() => setActiveTab('join')}
              activeOpacity={0.8}
            >
              <Users size={16} color={activeTab === 'join' ? theme.accent : theme.textMuted} />
              <Text style={[styles.tabText, { color: theme.textMuted }, activeTab === 'join' && { color: theme.accent, fontWeight: '700' }]}>
                Join Room
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form Content */}
          <View style={styles.formSection}>
            {inviteCode && activeTab === 'join' && (
              <View style={[styles.inviteBanner, { backgroundColor: theme.pillMintBg, borderColor: theme.pillMintText }]}>
                <Radio size={20} color={theme.pillMintText} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inviteBannerTitle, { color: theme.pillMintText }]}>
                    You're invited to Room {inviteCode}!
                  </Text>
                  <Text style={[styles.inviteBannerSubtitle, { color: theme.textSecondary }]}>
                    Enter your name below and join with 1 tap.
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Your Display Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder, color: theme.textPrimary }]}
                placeholder="e.g. Alex"
                placeholderTextColor={theme.textMuted}
                value={displayName}
                onChangeText={setDisplayName}
                onFocus={handleInputFocus}
                autoCapitalize="words"
              />
            </View>

            {activeTab === 'join' && (
              <View style={styles.formGroup}>
                <View style={styles.inputLabelRow}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary, marginBottom: 0 }]}>5-Character Room Code</Text>
                  {Platform.OS === 'web' && (
                    <TouchableOpacity onPress={handlePasteClipboard} style={[styles.pasteBtn, { backgroundColor: theme.elevatedBg }]} activeOpacity={0.7}>
                      <ClipboardPaste size={12} color={theme.accent} />
                      <Text style={[styles.pasteBtnText, { color: theme.accent }]}>Paste</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.digitRow}>
                  {digits.map((digit, idx) => (
                    <TextInput
                      key={idx}
                      ref={digitInputRefs[idx]}
                      style={[
                        styles.digitBox,
                        { backgroundColor: theme.cardBg, borderColor: theme.cardBorder, color: theme.textPrimary },
                        digit ? { borderColor: theme.accent, backgroundColor: theme.pillBlueBg } : null,
                      ]}
                      value={digit}
                      onChangeText={(val) => handleDigitChange(val, idx)}
                      onKeyPress={(e) => handleDigitKeyPress(e, idx)}
                      onFocus={handleInputFocus}
                      maxLength={100}
                      autoCapitalize="characters"
                      placeholder="•"
                      placeholderTextColor={theme.textMuted}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Action Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: theme.accent }]}
              onPress={activeTab === 'create' ? handleCreateRoom : handleJoinRoom}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <View style={styles.submitBtnContent}>
                  <Text style={styles.submitBtnText}>
                    {activeTab === 'create' ? 'Create Session' : 'Join Session'}
                  </Text>
                  <ArrowRight size={18} color="#ffffff" />
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  topHeaderRow: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  brandSubtitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  offlineHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  offlineHeaderBtnText: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '700',
  },
  themeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  themeToggleText: {
    fontSize: 11,
    fontWeight: '600',
  },
  mainCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardHeading: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  cardSubtext: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
    maxWidth: 300,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    width: '100%',
    marginBottom: 18,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  activeTab: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  formSection: {
    width: '100%',
  },
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  inviteBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  inviteBannerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  formGroup: {
    marginBottom: 14,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pasteBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
  },
  digitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    width: '100%',
  },
  digitBox: {
    flex: 1,
    maxWidth: 62,
    height: 52,
    borderWidth: 1,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
  },
  submitButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#0052cc',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  submitBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  serverConfigToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    padding: 8,
  },
  serverConfigText: {
    fontSize: 12,
    fontWeight: '500',
  },
  configBox: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
  },
  configLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  configInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    marginBottom: 10,
  },
  saveConfigBtn: {
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveConfigText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
