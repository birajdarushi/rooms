import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Share,
  useColorScheme,
} from 'react-native';
import { Users, Copy, Crown, Headphones, Check } from 'lucide-react-native';
import { getAvatarColors } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';

interface Props {
  roomCode: string;
  memberCount: number;
  isHost: boolean;
  userDisplayName: string;
}

export const PeopleView: React.FC<Props> = ({
  roomCode,
  memberCount,
  isHost,
  userDisplayName,
}) => {
  const [copied, setCopied] = React.useState(false);
  const { isDark, theme } = useAppTheme();

  const handleCopy = async () => {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && (navigator as any).clipboard) {
        await (navigator as any).clipboard.writeText(roomCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } else {
      Share.share({
        message: `Join my Room listening party! Code: ${roomCode}`,
      });
    }
  };

  const renderAvatar = (name: string, size = 44) => {
    const colors = getAvatarColors(name, isDark);
    const initial = (name || 'U').trim().charAt(0).toUpperCase();

    return (
      <View
        style={[
          styles.avatarBase,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.bg,
          },
        ]}
      >
        <Text style={[styles.avatarText, { color: colors.text, fontSize: size * 0.42 }]}>
          {initial}
        </Text>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Invite Friends Banner */}
      <View style={[styles.inviteCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        <View style={styles.inviteHeader}>
          <Users size={22} color={theme.accent} />
          <View>
            <Text style={[styles.inviteTitle, { color: theme.textPrimary }]}>Invite Friends to Room</Text>
            <Text style={[styles.inviteSub, { color: theme.textSecondary }]}>
              Share this 5-character code to listen in sync
            </Text>
          </View>
        </View>

        <View style={styles.codeRow}>
          <View style={[styles.codePill, { backgroundColor: theme.pillBlueBg }]}>
            <Text style={[styles.codePrefix, { color: theme.pillBlueText }]}>ROOM</Text>
            <Text style={[styles.codeText, { color: theme.pillBlueText }]}>{roomCode}</Text>
          </View>

          <TouchableOpacity
            style={[styles.copyBtn, { backgroundColor: theme.elevatedBg }]}
            onPress={handleCopy}
            activeOpacity={0.8}
          >
            {copied ? <Check size={16} color="#16a34a" /> : <Copy size={16} color={theme.accent} />}
            <Text style={[styles.copyBtnText, { color: copied ? '#16a34a' : theme.accent }]}>
              {copied ? 'Copied!' : 'Copy Code'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Member Count & Status */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
          Connected Listeners ({memberCount})
        </Text>
      </View>

      {/* Member List */}
      <View style={[styles.memberListCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        {/* You */}
        <View style={[styles.memberRow, { borderBottomColor: theme.cardBorder }]}>
          {renderAvatar(userDisplayName)}
          <View style={styles.memberInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.memberName, { color: theme.textPrimary }]}>
                {userDisplayName} (You)
              </Text>
              {isHost ? (
                <View style={[styles.hostBadge, { backgroundColor: theme.pillBlueBg }]}>
                  <Crown size={10} color={theme.pillBlueText} />
                  <Text style={[styles.hostBadgeText, { color: theme.pillBlueText }]}>Host</Text>
                </View>
              ) : (
                <View style={[styles.listenerBadge, { backgroundColor: theme.pillMintBg }]}>
                  <Headphones size={10} color={theme.pillMintText} />
                  <Text style={[styles.listenerBadgeText, { color: theme.pillMintText }]}>Listening</Text>
                </View>
              )}
            </View>
            <Text style={[styles.memberStatus, { color: theme.textMuted }]}>Connected • In Sync</Text>
          </View>
          <View style={styles.onlineDot} />
        </View>

        {/* Other Members in party */}
        {memberCount > 1 &&
          Array.from({ length: memberCount - 1 }).map((_, i) => {
            const listenerName = `Listener #${i + 1}`;
            return (
              <View
                key={i}
                style={[
                  styles.memberRow,
                  i === memberCount - 2 && { borderBottomWidth: 0 },
                  { borderBottomColor: theme.cardBorder },
                ]}
              >
                {renderAvatar(listenerName)}
                <View style={styles.memberInfo}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.memberName, { color: theme.textPrimary }]}>{listenerName}</Text>
                    <View style={[styles.listenerBadge, { backgroundColor: theme.pillMintBg }]}>
                      <Headphones size={10} color={theme.pillMintText} />
                      <Text style={[styles.listenerBadgeText, { color: theme.pillMintText }]}>Listening</Text>
                    </View>
                  </View>
                  <Text style={[styles.memberStatus, { color: theme.textMuted }]}>Audio Synced</Text>
                </View>
                <View style={styles.onlineDot} />
              </View>
            );
          })}
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
  inviteCard: {
    width: '100%',
    maxWidth: 680,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  inviteTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  inviteSub: {
    fontSize: 13,
    marginTop: 2,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  codePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  codePrefix: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  codeText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  copyBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionHeader: {
    width: '100%',
    maxWidth: 680,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  memberListCard: {
    width: '100%',
    maxWidth: 680,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  avatarBase: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontWeight: '800',
  },
  memberInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '700',
  },
  hostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  hostBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  listenerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  listenerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  memberStatus: {
    fontSize: 12,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginLeft: 10,
  },
});
