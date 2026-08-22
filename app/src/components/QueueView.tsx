import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  useColorScheme,
} from 'react-native';
import { Play, Plus, Trash2, Music, Volume2 } from 'lucide-react-native';
import { QueueItem, Song } from '../types';
import { useAppTheme } from '../context/ThemeContext';

interface Props {
  queue: QueueItem[];
  currentSong: Song | null;
  isPlaying: boolean;
  isHost: boolean;
  onPlaySong: (songId: string) => void;
  onRemoveSong: (queueItemId: string) => void;
  onOpenUpload: () => void;
}

const DEFAULT_THUMB =
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&auto=format&fit=crop&q=80';

export const QueueView: React.FC<Props> = ({
  queue,
  currentSong,
  isPlaying,
  isHost,
  onPlaySong,
  onRemoveSong,
  onOpenUpload,
}) => {
  const { isDark, theme } = useAppTheme();

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header & Add Button */}
      <View style={styles.headerRow}>
        <View style={styles.titleWithBadge}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Up Next</Text>
          <View style={[styles.countBadge, { backgroundColor: theme.pillBlueBg }]}>
            <Text style={[styles.countBadgeText, { color: theme.pillBlueText }]}>{queue.length} Tracks</Text>
          </View>
        </View>

        {isHost && (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}
            onPress={onOpenUpload}
            activeOpacity={0.8}
          >
            <Plus size={15} color={theme.accent} />
            <Text style={[styles.addBtnText, { color: theme.accent }]}>Add to Queue</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Empty State */}
      {queue.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
          <Music size={44} color={theme.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Queue is empty</Text>
          <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
            {isHost ? 'Add your favorite MP3 / audio tracks to start the listening party.' : 'Waiting for host to add tracks.'}
          </Text>
          {isHost && (
            <TouchableOpacity
              style={[styles.emptyAddBtn, { backgroundColor: theme.accent }]}
              onPress={onOpenUpload}
              activeOpacity={0.85}
            >
              <Plus size={18} color="#ffffff" />
              <Text style={styles.emptyAddBtnText}>Upload Audio Files</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={[styles.queueCardList, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
          {queue.map((item, index) => {
            const isItemPlaying = currentSong?.id === item.song.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.trackRow,
                  { borderBottomColor: theme.cardBorder },
                  isItemPlaying && { backgroundColor: theme.pillBlueBg },
                ]}
                onPress={() => isHost && onPlaySong(item.song.id)}
                activeOpacity={isHost ? 0.7 : 1}
              >
                {/* Index / Play Indicator */}
                <View style={styles.indexCol}>
                  {isItemPlaying && isPlaying ? (
                    <Volume2 size={16} color={theme.accent} />
                  ) : (
                    <Text style={[styles.indexText, { color: theme.textMuted }, isItemPlaying && { color: theme.accent }]}>
                      {index + 1}
                    </Text>
                  )}
                </View>

                {/* Thumbnail */}
                <Image
                  source={{ uri: item.song.artworkUrl || DEFAULT_THUMB }}
                  style={[styles.thumbImage, { backgroundColor: theme.elevatedBg }]}
                />

                {/* Track Info */}
                <View style={styles.infoCol}>
                  <Text
                    style={[styles.trackName, { color: theme.textPrimary }, isItemPlaying && { color: theme.accent }]}
                    numberOfLines={1}
                  >
                    {item.song.title}
                  </Text>
                  <Text style={[styles.trackMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                    {item.song.artist || 'Unknown Artist'} • Added by {item.addedBy || 'Host'}
                  </Text>
                </View>

                {/* Duration */}
                <Text style={[styles.durationText, { color: theme.textMuted }]}>
                  {formatDuration(item.song.duration)}
                </Text>

                {/* Play action or Delete action */}
                {isHost && (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.actionIconBtn, { backgroundColor: theme.elevatedBg }]}
                      onPress={() => onPlaySong(item.song.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Play size={15} color={theme.accent} fill={isItemPlaying ? theme.accent : 'none'} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionIconBtn, { backgroundColor: theme.elevatedBg }]}
                      onPress={() => onRemoveSong(item.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Trash2 size={15} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
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
  headerRow: {
    width: '100%',
    maxWidth: 680,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    width: '100%',
    maxWidth: 680,
    borderRadius: 24,
    borderWidth: 1,
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 12,
    lineHeight: 18,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyAddBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  queueCardList: {
    width: '100%',
    maxWidth: 680,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 2,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  indexCol: {
    width: 24,
    alignItems: 'center',
    marginRight: 8,
  },
  indexText: {
    fontSize: 13,
    fontWeight: '600',
  },
  thumbImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginRight: 14,
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 8,
  },
  trackName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  trackMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  durationText: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    padding: 7,
    borderRadius: 8,
  },
});
