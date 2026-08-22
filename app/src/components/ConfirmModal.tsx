import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { LogOut, AlertTriangle, ArrowRight, X } from 'lucide-react-native';
import { useAppTheme } from '../context/ThemeContext';

interface Props {
  visible: boolean;
  isHost?: boolean;
  type?: 'confirm_exit' | 'room_ended';
  roomCode?: string;
  endReason?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmModal: React.FC<Props> = ({
  visible,
  isHost = false,
  type = 'confirm_exit',
  roomCode,
  endReason,
  onClose,
  onConfirm,
}) => {
  const { theme, isDark } = useAppTheme();

  if (!visible) return null;

  const isRoomEnded = type === 'room_ended';

  const title = isRoomEnded
    ? 'Session Concluded'
    : isHost
    ? 'End Listening Party?'
    : 'Leave this Room?';

  const description = isRoomEnded
    ? endReason === 'grace_expired'
      ? 'The host disconnected and the grace period elapsed. The room has been closed.'
      : 'The host has ended this listening party. Thank you for listening!'
    : isHost
    ? 'Ending the party will disconnect all members and permanently delete all uploaded audio from storage.'
    : `Are you sure you want to leave room ${roomCode || ''}? You can always rejoin using the room code.`;

  const confirmText = isRoomEnded
    ? 'Back to Lounge'
    : isHost
    ? 'End Party'
    : 'Leave Room';

  const confirmColor = isRoomEnded ? '#ff8a5f' : '#ef4444';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isRoomEnded ? onConfirm : onClose}
    >
      <TouchableWithoutFeedback onPress={isRoomEnded ? onConfirm : onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.cardBg,
                  borderColor: isDark ? 'rgba(245, 237, 225, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                },
              ]}
            >
              {/* Close Button (only for confirm_exit) */}
              {!isRoomEnded && (
                <TouchableOpacity
                  style={[
                    styles.closeBtn,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' },
                  ]}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <X size={16} color={theme.textMuted} />
                </TouchableOpacity>
              )}

              {/* Glowing Icon Badge */}
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: isRoomEnded
                      ? 'rgba(255, 138, 95, 0.15)'
                      : 'rgba(239, 68, 68, 0.15)',
                  },
                ]}
              >
                {isRoomEnded ? (
                  <LogOut size={26} color="#ff8a5f" />
                ) : (
                  <AlertTriangle size={26} color="#ef4444" />
                )}
              </View>

              {/* Title & Description */}
              <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
              <Text style={[styles.description, { color: theme.textSecondary }]}>
                {description}
              </Text>

              {/* Action Buttons */}
              <View style={styles.btnRow}>
                {!isRoomEnded && (
                  <TouchableOpacity
                    style={[
                      styles.cancelBtn,
                      {
                        backgroundColor: isDark ? '#2A2119' : '#f1f1f1',
                        borderColor: isDark ? 'rgba(245, 237, 225, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                      },
                    ]}
                    onPress={onClose}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.cancelBtnText, { color: theme.textPrimary }]}>
                      Keep Jamming
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.confirmBtn,
                    { backgroundColor: confirmColor },
                    isRoomEnded && { flex: 1 },
                  ]}
                  onPress={onConfirm}
                  activeOpacity={0.85}
                >
                  <Text style={styles.confirmBtnText}>{confirmText}</Text>
                  <ArrowRight size={16} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 8,
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
