import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Music, Plus, Trash2, ArrowUp, ArrowDown, Disc3 } from 'lucide-react-native';
import { QueueItem, Song } from '../types';

interface Props {
  queue: QueueItem[];
  currentSong: Song | null;
  isHost: boolean;
  onOpenUpload: () => void;
  onReorder: (newOrderedIds: string[]) => void;
  onRemove: (queueItemId: string) => void;
}

export const QueueDrawer: React.FC<Props> = ({
  queue,
  currentSong,
  isHost,
  onOpenUpload,
  onReorder,
  onRemove,
}) => {
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const newItems = [...queue];
    const temp = newItems[index];
    newItems[index] = newItems[index - 1];
    newItems[index - 1] = temp;
    onReorder(newItems.map((item) => item.id));
  };

  const handleMoveDown = (index: number) => {
    if (index >= queue.length - 1) return;
    const newItems = [...queue];
    const temp = newItems[index];
    newItems[index] = newItems[index + 1];
    newItems[index + 1] = temp;
    onReorder(newItems.map((item) => item.id));
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Music size={18} color="#a855f7" />
          <Text style={styles.headerTitle}>Queue ({queue.length})</Text>
        </View>

        {isHost && (
          <TouchableOpacity style={styles.addSongButton} onPress={onOpenUpload}>
            <Plus size={16} color="#ffffff" />
            <Text style={styles.addSongButtonText}>Add Song</Text>
          </TouchableOpacity>
        )}
      </View>

      {queue.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            {isHost
              ? 'Queue is empty. Click "+ Add Song" to upload audio.'
              : 'Queue is empty. Host will add songs soon.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(item) => item.id}
          scrollEnabled={true}
          style={styles.list}
          renderItem={({ item, index }) => {
            const isCurrent = currentSong?.id === item.songId;
            return (
              <View style={[styles.queueItem, isCurrent && styles.activeQueueItem]}>
                <View style={styles.positionBadge}>
                  {isCurrent ? (
                    <Disc3 size={16} color="#818cf8" />
                  ) : (
                    <Text style={styles.positionText}>{index + 1}</Text>
                  )}
                </View>

                <View style={styles.songInfo}>
                  <Text style={[styles.songTitle, isCurrent && styles.activeSongTitle]} numberOfLines={1}>
                    {item.song.title}
                  </Text>
                  <Text style={styles.songArtist} numberOfLines={1}>
                    {item.song.artist} • {formatDuration(item.song.duration)}
                  </Text>
                </View>

                {isHost && (
                  <View style={styles.actionsRow}>
                    {index > 0 && (
                      <TouchableOpacity onPress={() => handleMoveUp(index)} style={styles.iconBtn}>
                        <ArrowUp size={16} color="#94a3b8" />
                      </TouchableOpacity>
                    )}
                    {index < queue.length - 1 && (
                      <TouchableOpacity onPress={() => handleMoveDown(index)} style={styles.iconBtn}>
                        <ArrowDown size={16} color="#94a3b8" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => onRemove(item.id)} style={styles.iconBtn}>
                      <Trash2 size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1322',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  addSongButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 4,
  },
  addSongButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
  },
  list: {
    maxHeight: 220,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeQueueItem: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderColor: 'rgba(99, 102, 241, 0.4)',
  },
  positionBadge: {
    width: 24,
    alignItems: 'center',
    marginRight: 8,
  },
  positionText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  activeSongTitle: {
    color: '#a5b4fc',
  },
  songArtist: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 6,
  },
});
