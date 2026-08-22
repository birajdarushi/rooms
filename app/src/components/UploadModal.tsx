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
import {
  Sparkles,
  X,
  UploadCloud,
  CheckCircle2,
  Youtube,
  ClipboardPaste,
  Clock,
  User,
  Music,
  Link,
  Radio,
  FileAudio,
} from 'lucide-react-native';
import { api } from '../api/client';
import { useAppTheme } from '../context/ThemeContext';

interface Props {
  visible: boolean;
  roomId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type DetectedSource = 'spotify' | 'youtube' | 'file' | null;

export const UploadModal: React.FC<Props> = ({ visible, roomId, onClose, onSuccess }) => {
  const { isDark, theme } = useAppTheme();

  // Smart Input State
  const [smartLink, setSmartLink] = useState('');
  const [detectedSource, setDetectedSource] = useState<DetectedSource>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Resolved Link Preview State
  const [previewInfo, setPreviewInfo] = useState<{
    title: string;
    artist: string;
    duration: number;
    thumbnail: string;
    source: 'spotify' | 'youtube';
  } | null>(null);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [fileArtist, setFileArtist] = useState('');
  const [fileDuration, setFileDuration] = useState<number>(180);

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');

  const formatSeconds = (sec: number) => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const detectLinkType = (text: string): 'spotify' | 'youtube' | null => {
    const raw = text.trim();
    if (/spotify\.com\/track|spotify:track/i.test(raw)) return 'spotify';
    if (/youtube\.com|youtu\.be/i.test(raw)) return 'youtube';
    return null;
  };

  const handleLinkChange = (text: string) => {
    setSmartLink(text);
    if (selectedFile) {
      setSelectedFile(null);
    }

    const type = detectLinkType(text);
    setDetectedSource(type);

    if (type) {
      fetchLinkPreview(text.trim(), type);
    } else {
      setPreviewInfo(null);
    }
  };

  const fetchLinkPreview = async (url: string, type: 'spotify' | 'youtube') => {
    if (!url) return;
    try {
      setIsLoadingPreview(true);
      if (type === 'spotify') {
        const info = await api.getSpotifyInfo(url);
        setPreviewInfo({
          title: info.title,
          artist: info.artist,
          duration: info.duration,
          thumbnail: info.thumbnail,
          source: 'spotify',
        });
      } else {
        const info = await api.getYoutubeInfo(url);
        setPreviewInfo({
          title: info.title,
          artist: info.artist,
          duration: info.duration,
          thumbnail: info.thumbnail,
          source: 'youtube',
        });
      }
    } catch (err: any) {
      console.warn('[SmartModal] Error fetching link preview:', err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).clipboard?.readText) {
        const text = await (navigator as any).clipboard.readText();
        if (text && text.trim()) {
          handleLinkChange(text.trim());
        }
      }
    } catch (e) {
      console.warn('Clipboard read failed:', e);
    }
  };

  const handlePickAudioFile = async () => {
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
    setSmartLink('');
    setPreviewInfo(null);
    setDetectedSource('file');

    const cleanName = fileName.replace(/\.[^/.]+$/, '');
    setFileTitle(cleanName);
    setFileArtist('Uploaded Track');

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const audio = new Audio();
        const url = URL.createObjectURL(fileObj);
        audio.src = url;
        audio.onloadedmetadata = () => {
          if (audio.duration && !isNaN(audio.duration)) {
            setFileDuration(Math.round(audio.duration));
          }
          URL.revokeObjectURL(url);
        };
      } catch (e) {}
    }
  };

  const handleSubmit = async () => {
    // 1. If Spotify or YouTube Link
    if (detectedSource === 'spotify' || detectedSource === 'youtube') {
      const url = smartLink.trim();
      try {
        setIsProcessing(true);
        setProcessingStep(
          detectedSource === 'spotify'
            ? 'Extracting Spotify track audio...'
            : 'Extracting YouTube audio...'
        );

        if (detectedSource === 'spotify') {
          await api.addSpotifySong(roomId, {
            url,
            title: previewInfo?.title,
            artist: previewInfo?.artist,
          });
        } else {
          await api.addYoutubeSong(roomId, {
            url,
            title: previewInfo?.title,
            artist: previewInfo?.artist,
          });
        }

        setIsProcessing(false);
        resetAndClose();
      } catch (err: any) {
        console.error('Link queue failed:', err);
        setIsProcessing(false);
        Alert.alert('Queue Error', err.message || 'Failed to process audio stream.');
      }
      return;
    }

    // 2. If Local Audio File
    if (selectedFile) {
      try {
        setIsProcessing(true);
        setProcessingStep('Preparing upload credentials...');

        const filename = selectedFile.name || 'audio.mp3';
        const mimeType = selectedFile.type || selectedFile.mimeType || 'audio/mpeg';

        const { uploadUrl, storageKey, publicUrl } = await api.getPresignedUploadUrl(
          roomId,
          filename,
          mimeType
        );

        setProcessingStep('Uploading audio directly to storage...');
        await api.uploadToStorage(uploadUrl, selectedFile, mimeType);

        setProcessingStep('Adding to room queue...');
        await api.registerSong(roomId, {
          storageUrl: publicUrl,
          storageKey,
          title: fileTitle.trim() || 'Untitled Track',
          artist: fileArtist.trim() || 'Uploaded Artist',
          duration: fileDuration > 0 ? fileDuration : 180,
        });

        setIsProcessing(false);
        resetAndClose();
      } catch (err: any) {
        console.error('File upload failed:', err);
        setIsProcessing(false);
        Alert.alert('Upload Error', err.message || 'Failed to upload audio.');
      }
      return;
    }

    Alert.alert('Add Song', 'Please paste a Spotify/YouTube link or pick an audio file.');
  };

  const resetAndClose = () => {
    setSmartLink('');
    setPreviewInfo(null);
    setSelectedFile(null);
    setDetectedSource(null);
    setFileTitle('');
    setFileArtist('');
    onSuccess();
    onClose();
  };

  const isSubmitDisabled = isProcessing || (!smartLink.trim() && !selectedFile);

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
            <TouchableOpacity onPress={onClose} disabled={isProcessing}>
              <X size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
            {/* Smart Link Input */}
            <View style={styles.formGroup}>
              <View style={styles.inputHeaderRow}>
                <View style={styles.labelRow}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Paste Song Link</Text>
                  {detectedSource === 'spotify' && (
                    <View style={[styles.sourceBadge, { backgroundColor: '#1DB954' }]}>
                      <Radio size={11} color="#ffffff" />
                      <Text style={styles.sourceBadgeText}>Spotify Detected</Text>
                    </View>
                  )}
                  {detectedSource === 'youtube' && (
                    <View style={[styles.sourceBadge, { backgroundColor: '#ef4444' }]}>
                      <Youtube size={11} color="#ffffff" />
                      <Text style={styles.sourceBadgeText}>YouTube Detected</Text>
                    </View>
                  )}
                </View>

                {Platform.OS === 'web' && (
                  <TouchableOpacity onPress={handlePasteClipboard} style={[styles.pasteBadge, { backgroundColor: theme.elevatedBg }]}>
                    <ClipboardPaste size={12} color={theme.accent} />
                    <Text style={[styles.pasteBadgeText, { color: theme.accent }]}>Paste</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.urlInputRow}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      flex: 1,
                      backgroundColor: theme.elevatedBg,
                      borderColor: detectedSource === 'spotify' ? '#1DB954' : detectedSource === 'youtube' ? '#ef4444' : theme.cardBorder,
                      color: theme.textPrimary,
                    },
                  ]}
                  placeholder="Paste Spotify link or YouTube link..."
                  placeholderTextColor={theme.textMuted}
                  value={smartLink}
                  onChangeText={handleLinkChange}
                  editable={!isProcessing}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {isLoadingPreview && (
                  <View style={styles.loadingIndicatorBox}>
                    <ActivityIndicator size="small" color={theme.accent} />
                  </View>
                )}
              </View>
            </View>

            {/* Smart Link Preview Card */}
            {previewInfo && (
              <View
                style={[
                  styles.previewCard,
                  {
                    backgroundColor: theme.elevatedBg,
                    borderColor: previewInfo.source === 'spotify' ? 'rgba(29, 185, 84, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                  },
                ]}
              >
                {previewInfo.thumbnail ? (
                  <Image source={{ uri: previewInfo.thumbnail }} style={styles.previewThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.previewThumbPlaceholder, { backgroundColor: theme.cardBorder }]}>
                    <Music size={24} color="#ffffff" />
                  </View>
                )}
                <View style={styles.previewDetails}>
                  <View style={styles.badgeRow}>
                    <View
                      style={[
                        styles.miniBadge,
                        { backgroundColor: previewInfo.source === 'spotify' ? '#1DB954' : '#ef4444' },
                      ]}
                    >
                      <Text style={styles.miniBadgeText}>
                        {previewInfo.source === 'spotify' ? 'SPOTIFY' : 'YOUTUBE'}
                      </Text>
                    </View>
                    <Text style={[styles.durationBadgeText, { color: theme.accent }]}>
                      {formatSeconds(previewInfo.duration)}
                    </Text>
                  </View>
                  <Text style={[styles.previewTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                    {previewInfo.title}
                  </Text>
                  <Text style={[styles.previewArtist, { color: theme.textSecondary }]} numberOfLines={1}>
                    {previewInfo.artist}
                  </Text>
                </View>
              </View>
            )}

            {/* Divider OR */}
            <View style={styles.orDividerRow}>
              <View style={[styles.orDividerLine, { backgroundColor: theme.cardBorder }]} />
              <Text style={[styles.orDividerText, { color: theme.textMuted }]}>OR PICK A FILE</Text>
              <View style={[styles.orDividerLine, { backgroundColor: theme.cardBorder }]} />
            </View>

            {/* File Upload Selector */}
            <TouchableOpacity
              style={[
                styles.filePickButton,
                { backgroundColor: theme.elevatedBg, borderColor: selectedFile ? '#22c55e' : theme.cardBorder },
                selectedFile && styles.filePickedCard,
              ]}
              onPress={handlePickAudioFile}
              disabled={isProcessing}
            >
              {selectedFile ? (
                <View style={styles.fileInfoRow}>
                  <CheckCircle2 size={22} color="#22c55e" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fileInfoName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {selectedFile.name || fileTitle || 'Audio File Ready'}
                    </Text>
                    <Text style={[styles.fileInfoSize, { color: theme.textSecondary }]}>
                      {selectedFile.size ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Local file selected'}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.filePromptRow}>
                  <UploadCloud size={20} color={theme.accent} />
                  <Text style={[styles.filePromptText, { color: theme.textPrimary }]}>Choose MP3, WAV, M4A, FLAC</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Processing Step Box */}
            {isProcessing && (
              <View style={[styles.progressBox, { backgroundColor: theme.pillBlueBg }]}>
                <ActivityIndicator size="small" color={theme.accent} />
                <Text style={[styles.progressText, { color: theme.accent }]}>{processingStep}</Text>
              </View>
            )}

            {/* Unified Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                {
                  backgroundColor:
                    detectedSource === 'spotify'
                      ? '#1DB954'
                      : detectedSource === 'youtube'
                      ? '#ef4444'
                      : theme.accent,
                },
                isSubmitDisabled && styles.disabledSubmit,
              ]}
              onPress={handleSubmit}
              disabled={isSubmitDisabled}
            >
              {detectedSource === 'spotify' ? (
                <Radio size={18} color="#ffffff" />
              ) : detectedSource === 'youtube' ? (
                <Youtube size={18} color="#ffffff" />
              ) : (
                <UploadCloud size={18} color="#ffffff" />
              )}
              <Text style={styles.submitText}>
                {isProcessing
                  ? 'Processing & Syncing...'
                  : detectedSource === 'spotify'
                  ? 'Add Spotify Track to Queue'
                  : detectedSource === 'youtube'
                  ? 'Add YouTube Track to Queue'
                  : selectedFile
                  ? 'Upload & Add to Queue'
                  : 'Add Track to Queue'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
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
  formGroup: {
    marginBottom: 12,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sourceBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
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
    alignItems: 'center',
    position: 'relative',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  loadingIndicatorBox: {
    position: 'absolute',
    right: 12,
  },
  previewCard: {
    flexDirection: 'row',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    gap: 12,
    alignItems: 'center',
  },
  previewThumb: {
    width: 65,
    height: 65,
    borderRadius: 8,
  },
  previewThumbPlaceholder: {
    width: 65,
    height: 65,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewDetails: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  miniBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  miniBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  durationBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  previewArtist: {
    fontSize: 12,
  },
  orDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 12,
  },
  orDividerLine: {
    flex: 1,
    height: 1,
  },
  orDividerText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  filePickButton: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  filePickedCard: {
    borderStyle: 'solid',
  },
  filePromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  filePromptText: {
    fontSize: 13,
    fontWeight: '600',
  },
  fileInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fileInfoName: {
    fontSize: 13,
    fontWeight: '700',
  },
  fileInfoSize: {
    fontSize: 11,
    marginTop: 1,
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
