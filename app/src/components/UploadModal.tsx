import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { UploadCloud, X, Music, CheckCircle2, Youtube, Sparkles, ClipboardPaste, Clock, User, Play } from 'lucide-react-native';
import { api } from '../api/client';
import { useAppTheme } from '../context/ThemeContext';

interface Props {
  visible: boolean;
  roomId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const UploadModal: React.FC<Props> = ({ visible, roomId, onClose, onSuccess }) => {
  const { isDark, theme } = useAppTheme();
  const [activeTab, setActiveTab] = useState<'upload' | 'youtube'>('youtube');

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [duration, setDuration] = useState<number>(180);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<string>('');

  // YouTube State
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [ytLoadingInfo, setYtLoadingInfo] = useState(false);
  const [ytInfo, setYtInfo] = useState<{
    title: string;
    artist: string;
    duration: number;
    thumbnail: string;
    youtubeUrl: string;
  } | null>(null);

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handlePickAudio = async () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*,.mp3,.m4a,.wav,.flac,.aac,.ogg';
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (file) {
          processAudioFile(file, file.name, file.type, file.size);
        }
      };
      input.click();
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        processAudioFile(file, file.name, file.mimeType || 'audio/mpeg', file.size || 0);
      }
    } catch (err) {
      console.error('Error picking document:', err);
    }
  };

  const processAudioFile = (fileObj: any, fileName: string, mimeType: string, fileSize: number) => {
    setSelectedFile(fileObj);

    const cleanName = fileName.replace(/\.[^/.]+$/, '');
    if (!title) {
      setTitle(cleanName);
    }
    if (!artist) {
      setArtist('Uploaded Track');
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const audio = new Audio();
        const url = URL.createObjectURL(fileObj);
        audio.src = url;
        audio.onloadedmetadata = () => {
          if (audio.duration && !isNaN(audio.duration)) {
            setDuration(Math.round(audio.duration));
          }
          URL.revokeObjectURL(url);
        };
      } catch (e) {
        console.warn('Could not read audio duration preview:', e);
      }
    }
  };

  const handlePasteYoutubeClipboard = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).clipboard?.readText) {
        const text = await (navigator as any).clipboard.readText();
        if (text && text.trim()) {
          setYoutubeUrl(text.trim());
          fetchYoutubeInfo(text.trim());
        }
      }
    } catch (e) {
      console.warn('Clipboard read failed:', e);
    }
  };

  const fetchYoutubeInfo = async (urlToFetch?: string) => {
    const targetUrl = (urlToFetch || youtubeUrl).trim();
    if (!targetUrl) return;

    try {
      setYtLoadingInfo(true);
      const info = await api.getYoutubeInfo(targetUrl);
      setYtInfo(info);
    } catch (err: any) {
      console.warn('Could not fetch YouTube info:', err);
      Alert.alert('YouTube Link', err.message || 'Please check the YouTube URL.');
    } finally {
      setYtLoadingInfo(false);
    }
  };

  const handleUploadAndQueue = async () => {
    if (!selectedFile) {
      Alert.alert('Select File', 'Please pick an audio file first.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a song title.');
      return;
    }

    try {
      setIsUploading(true);
      setUploadStep('Getting upload credentials...');

      const filename = selectedFile.name || 'audio.mp3';
      const mimeType = selectedFile.type || selectedFile.mimeType || 'audio/mpeg';

      const { uploadUrl, storageKey, publicUrl } = await api.getPresignedUploadUrl(
        roomId,
        filename,
        mimeType
      );

      setUploadStep('Uploading direct to storage...');
      await api.uploadToStorage(uploadUrl, selectedFile, mimeType);

      setUploadStep('Adding to room queue...');
      await api.registerSong(roomId, {
        storageUrl: publicUrl,
        storageKey,
        title: title.trim(),
        artist: artist.trim() || 'Unknown Artist',
        duration: duration > 0 ? duration : 180,
      });

      setIsUploading(false);
      resetAndClose();
    } catch (err: any) {
      console.error('Upload failed:', err);
      setIsUploading(false);
      Alert.alert('Upload Error', err.message || 'Failed to upload audio.');
    }
  };

  const handleQueueYoutube = async () => {
    const targetUrl = youtubeUrl.trim();
    if (!targetUrl) {
      Alert.alert('YouTube Link', 'Please paste a valid YouTube URL.');
      return;
    }

    try {
      setIsUploading(true);
      setUploadStep('Extracting audio from YouTube...');

      await api.addYoutubeSong(roomId, {
        url: targetUrl,
        title: ytInfo?.title,
        artist: ytInfo?.artist,
      });

      setIsUploading(false);
      resetAndClose();
    } catch (err: any) {
      console.error('YouTube Queue failed:', err);
      setIsUploading(false);
      Alert.alert('YouTube Error', err.message || 'Failed to process YouTube audio.');
    }
  };

  const resetAndClose = () => {
    setSelectedFile(null);
    setTitle('');
    setArtist('');
    setYoutubeUrl('');
    setYtInfo(null);
    onSuccess();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Sparkles size={20} color={theme.accent} />
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Add Track to Party</Text>
            </View>
            <TouchableOpacity onPress={onClose} disabled={isUploading}>
              <X size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Segmented Mode Selector */}
          <View style={[styles.tabRow, { backgroundColor: theme.elevatedBg, borderColor: theme.cardBorder }]}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'youtube' && [styles.activeTabBtn, { backgroundColor: theme.cardBg }]]}
              onPress={() => setActiveTab('youtube')}
            >
              <Youtube size={16} color={activeTab === 'youtube' ? '#ef4444' : theme.textMuted} />
              <Text
                style={[
                  styles.tabBtnText,
                  { color: activeTab === 'youtube' ? theme.textPrimary : theme.textMuted },
                ]}
              >
                YouTube Link
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'upload' && [styles.activeTabBtn, { backgroundColor: theme.cardBg }]]}
              onPress={() => setActiveTab('upload')}
            >
              <UploadCloud size={16} color={activeTab === 'upload' ? theme.accent : theme.textMuted} />
              <Text
                style={[
                  styles.tabBtnText,
                  { color: activeTab === 'upload' ? theme.textPrimary : theme.textMuted },
                ]}
              >
                Audio File
              </Text>
            </TouchableOpacity>
          </View>

          {/* TAB 1: YOUTUBE LINK */}
          {activeTab === 'youtube' && (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <View style={styles.formGroup}>
                <View style={styles.inputHeaderRow}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>YouTube / Music URL</Text>
                  {Platform.OS === 'web' && (
                    <TouchableOpacity onPress={handlePasteYoutubeClipboard} style={[styles.pasteBadge, { backgroundColor: theme.elevatedBg }]}>
                      <ClipboardPaste size={12} color={theme.accent} />
                      <Text style={[styles.pasteBadgeText, { color: theme.accent }]}>Paste Link</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.urlInputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: theme.elevatedBg, borderColor: theme.cardBorder, color: theme.textPrimary }]}
                    placeholder="e.g. https://youtu.be/... or youtube.com/watch?v=..."
                    placeholderTextColor={theme.textMuted}
                    value={youtubeUrl}
                    onChangeText={(t) => {
                      setYoutubeUrl(t);
                      if (t.includes('youtu.be') || t.includes('youtube.com')) {
                        fetchYoutubeInfo(t);
                      }
                    }}
                    onBlur={() => fetchYoutubeInfo()}
                    editable={!isUploading}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[styles.previewBtn, { backgroundColor: theme.accent }]}
                    onPress={() => fetchYoutubeInfo()}
                    disabled={ytLoadingInfo || isUploading}
                  >
                    {ytLoadingInfo ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.previewBtnText}>Check</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* YouTube Preview Card */}
              {ytInfo && (
                <View style={[styles.ytPreviewCard, { backgroundColor: theme.elevatedBg, borderColor: theme.cardBorder }]}>
                  {ytInfo.thumbnail ? (
                    <Image source={{ uri: ytInfo.thumbnail }} style={styles.ytThumbnail} resizeMode="cover" />
                  ) : (
                    <View style={[styles.ytThumbnailPlaceholder, { backgroundColor: theme.cardBorder }]}>
                      <Play size={24} color="#ffffff" />
                    </View>
                  )}
                  <View style={styles.ytPreviewDetails}>
                    <Text style={[styles.ytPreviewTitle, { color: theme.textPrimary }]} numberOfLines={2}>
                      {ytInfo.title}
                    </Text>
                    <View style={styles.ytMetaRow}>
                      <User size={12} color={theme.textMuted} />
                      <Text style={[styles.ytMetaText, { color: theme.textSecondary }]} numberOfLines={1}>
                        {ytInfo.artist}
                      </Text>
                    </View>
                    <View style={styles.ytMetaRow}>
                      <Clock size={12} color={theme.accent} />
                      <Text style={[styles.ytMetaText, { color: theme.accent, fontWeight: '700' }]}>
                        {formatSeconds(ytInfo.duration)}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Upload Status */}
              {isUploading && (
                <View style={[styles.progressBox, { backgroundColor: theme.pillBlueBg }]}>
                  <ActivityIndicator size="small" color={theme.accent} />
                  <Text style={[styles.progressText, { color: theme.accent }]}>{uploadStep}</Text>
                </View>
              )}

              {/* Action Button */}
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  { backgroundColor: '#ef4444' },
                  (!youtubeUrl.trim() || isUploading) && styles.disabledSubmit,
                ]}
                onPress={handleQueueYoutube}
                disabled={!youtubeUrl.trim() || isUploading}
              >
                <Youtube size={18} color="#ffffff" />
                <Text style={styles.submitText}>
                  {isUploading ? 'Extracting & Syncing...' : 'Add YouTube Track to Queue'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* TAB 2: LOCAL AUDIO FILE */}
          {activeTab === 'upload' && (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <TouchableOpacity
                style={[
                  styles.pickButton,
                  { backgroundColor: theme.elevatedBg, borderColor: theme.cardBorder },
                  selectedFile && styles.pickedFileCard,
                ]}
                onPress={handlePickAudio}
                disabled={isUploading}
              >
                {selectedFile ? (
                  <View style={styles.pickedFileInfo}>
                    <CheckCircle2 size={24} color="#22c55e" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickedFileName, { color: theme.textPrimary }]} numberOfLines={1}>
                        {selectedFile.name || 'Audio File Selected'}
                      </Text>
                      <Text style={[styles.pickedFileSize, { color: theme.textSecondary }]}>
                        {selectedFile.size ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Ready to upload'}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.pickPrompt}>
                    <Music size={32} color={theme.accent} />
                    <Text style={[styles.pickPromptText, { color: theme.textPrimary }]}>Click to select MP3, WAV, M4A, FLAC</Text>
                    <Text style={[styles.pickPromptSub, { color: theme.textMuted }]}>Direct upload to room audio storage</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Song Title</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.elevatedBg, borderColor: theme.cardBorder, color: theme.textPrimary }]}
                  placeholder="e.g. Midnight City"
                  placeholderTextColor={theme.textMuted}
                  value={title}
                  onChangeText={setTitle}
                  editable={!isUploading}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Artist</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.elevatedBg, borderColor: theme.cardBorder, color: theme.textPrimary }]}
                  placeholder="e.g. M83"
                  placeholderTextColor={theme.textMuted}
                  value={artist}
                  onChangeText={setArtist}
                  editable={!isUploading}
                />
              </View>

              {/* Upload Status */}
              {isUploading && (
                <View style={[styles.progressBox, { backgroundColor: theme.pillBlueBg }]}>
                  <ActivityIndicator size="small" color={theme.accent} />
                  <Text style={[styles.progressText, { color: theme.accent }]}>{uploadStep}</Text>
                </View>
              )}

              {/* Action Button */}
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  { backgroundColor: theme.accent },
                  (!selectedFile || isUploading) && styles.disabledSubmit,
                ]}
                onPress={handleUploadAndQueue}
                disabled={!selectedFile || isUploading}
              >
                <UploadCloud size={18} color="#ffffff" />
                <Text style={styles.submitText}>
                  {isUploading ? 'Uploading & Syncing...' : 'Upload & Add to Queue'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 12, 18, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 36,
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
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  tabRow: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  activeTabBtn: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: 14,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pasteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pasteBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  urlInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
  },
  previewBtn: {
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  ytPreviewCard: {
    flexDirection: 'row',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  ytThumbnail: {
    width: 90,
    height: 65,
    borderRadius: 8,
  },
  ytThumbnailPlaceholder: {
    width: 90,
    height: 65,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ytPreviewDetails: {
    flex: 1,
    justifyContent: 'space-between',
  },
  ytPreviewTitle: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  ytMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ytMetaText: {
    fontSize: 11,
  },
  pickButton: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 22,
    marginBottom: 16,
  },
  pickedFileCard: {
    borderStyle: 'solid',
    borderColor: '#22c55e',
  },
  pickPrompt: {
    alignItems: 'center',
    gap: 8,
  },
  pickPromptText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pickPromptSub: {
    fontSize: 12,
  },
  pickedFileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pickedFileName: {
    fontSize: 14,
    fontWeight: '700',
  },
  pickedFileSize: {
    fontSize: 12,
    marginTop: 2,
  },
  progressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
  },
  submitButton: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    gap: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledSubmit: {
    opacity: 0.45,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
