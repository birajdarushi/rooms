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
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { UploadCloud, X, Music, CheckCircle2 } from 'lucide-react-native';
import { api } from '../api/client';

interface Props {
  visible: boolean;
  roomId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const UploadModal: React.FC<Props> = ({ visible, roomId, onClose, onSuccess }) => {
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [duration, setDuration] = useState<number>(180);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<string>('');

  const hiddenFileInputRef = useRef<any>(null);

  const handlePickAudio = async () => {
    // If on web, we can trigger native HTML file dialog for 100% reliability
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

    // Auto populate title from filename
    const cleanName = fileName.replace(/\.[^/.]+$/, '');
    if (!title) {
      setTitle(cleanName);
    }
    if (!artist) {
      setArtist('Uploaded Track');
    }

    // Try reading audio duration on web
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
      setUploadStep('Getting pre-signed upload URL...');

      const filename = selectedFile.name || 'audio.mp3';
      const mimeType = selectedFile.type || selectedFile.mimeType || 'audio/mpeg';

      // 1. Get Presigned Upload URL
      const { uploadUrl, storageKey, publicUrl } = await api.getPresignedUploadUrl(
        roomId,
        filename,
        mimeType
      );

      // 2. Direct upload to storage (S3 / R2 / local)
      setUploadStep('Uploading audio directly to storage...');
      await api.uploadToStorage(uploadUrl, selectedFile, mimeType);

      // 3. Register Song & Append to Queue
      setUploadStep('Adding to room queue...');
      await api.registerSong(roomId, {
        storageUrl: publicUrl,
        storageKey,
        title: title.trim(),
        artist: artist.trim() || 'Unknown Artist',
        duration: duration > 0 ? duration : 180,
      });

      setIsUploading(false);
      setSelectedFile(null);
      setTitle('');
      setArtist('');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Upload failed:', err);
      setIsUploading(false);
      Alert.alert('Upload Error', err.message || 'Failed to upload audio.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <UploadCloud size={20} color="#6366f1" />
              <Text style={styles.modalTitle}>Upload Audio to Room</Text>
            </View>
            <TouchableOpacity onPress={onClose} disabled={isUploading}>
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* File Picker Button */}
          <TouchableOpacity
            style={[styles.pickButton, selectedFile && styles.pickedFileCard]}
            onPress={handlePickAudio}
            disabled={isUploading}
          >
            {selectedFile ? (
              <View style={styles.pickedFileInfo}>
                <CheckCircle2 size={24} color="#22c55e" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickedFileName} numberOfLines={1}>
                    {selectedFile.name || 'Audio File Selected'}
                  </Text>
                  <Text style={styles.pickedFileSize}>
                    {selectedFile.size ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Ready to upload'}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.pickPrompt}>
                <Music size={32} color="#6366f1" />
                <Text style={styles.pickPromptText}>Click to select MP3, WAV, M4A, or FLAC</Text>
                <Text style={styles.pickPromptSub}>Uploads direct-to-storage</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Metadata Form */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Song Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Midnight City"
              placeholderTextColor="#64748b"
              value={title}
              onChangeText={setTitle}
              editable={!isUploading}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Artist</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. M83"
              placeholderTextColor="#64748b"
              value={artist}
              onChangeText={setArtist}
              editable={!isUploading}
            />
          </View>

          {/* Upload Status */}
          {isUploading && (
            <View style={styles.progressBox}>
              <ActivityIndicator size="small" color="#818cf8" />
              <Text style={styles.progressText}>{uploadStep}</Text>
            </View>
          )}

          {/* Action Buttons */}
          <TouchableOpacity
            style={[styles.submitButton, (!selectedFile || isUploading) && styles.disabledSubmit]}
            onPress={handleUploadAndQueue}
            disabled={!selectedFile || isUploading}
          >
            <Text style={styles.submitText}>
              {isUploading ? 'Uploading & Syncing...' : 'Upload & Add to Queue'}
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
    backgroundColor: 'rgba(25, 27, 35, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#F9F7F2',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: '#E5E1D8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    color: '#191b23',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  pickButton: {
    borderWidth: 1.5,
    borderColor: '#c3c6d6',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 22,
    backgroundColor: '#ffffff',
    marginBottom: 18,
  },
  pickedFileCard: {
    borderStyle: 'solid',
    borderColor: '#acf0b0',
    backgroundColor: 'rgba(172, 240, 176, 0.2)',
  },
  pickPrompt: {
    alignItems: 'center',
    gap: 8,
  },
  pickPromptText: {
    color: '#191b23',
    fontSize: 14,
    fontWeight: '600',
  },
  pickPromptSub: {
    color: '#737685',
    fontSize: 12,
  },
  pickedFileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pickedFileName: {
    color: '#191b23',
    fontSize: 14,
    fontWeight: '700',
  },
  pickedFileSize: {
    color: '#434654',
    fontSize: 12,
    marginTop: 2,
  },
  formGroup: {
    marginBottom: 14,
  },
  label: {
    color: '#434654',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c3c6d6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#191b23',
    fontSize: 14,
  },
  progressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#dae2ff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  progressText: {
    color: '#003d9b',
    fontSize: 13,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#0052cc',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#0052cc',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledSubmit: {
    opacity: 0.45,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
