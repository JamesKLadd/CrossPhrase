import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { wordValue } from '../core/scoring';
import { displayWord } from '../core/words';
import { useDraggable, type DragSource } from './drag';
import { colors, wordFontSize } from './theme';

export function WordTile({
  word,
  size,
  source,
  selected,
  locked,
  enabled,
  onTap,
}: {
  word: string;
  size: number;
  source: DragSource;
  selected: boolean;
  /** Anchors: shown differently and never draggable. */
  locked?: boolean;
  enabled: boolean;
  onTap: () => void;
}) {
  const { gesture, isDragged } = useDraggable({
    source,
    word,
    size,
    enabled: enabled && !locked,
    onTap,
  });

  return (
    <GestureDetector gesture={gesture}>
      <View
        testID={`tile-${word}`}
        style={[
          styles.tile,
          { width: size, height: size },
          locked && styles.locked,
          selected && styles.selected,
          isDragged && styles.dragged,
        ]}
      >
        <Text numberOfLines={1} style={[styles.word, { fontSize: wordFontSize(word, size) }]}>
          {displayWord(word)}
        </Text>
        {!locked && <Text style={styles.value}>{wordValue(word)}</Text>}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.tile,
    borderWidth: 1.5,
    borderColor: colors.tileEdge,
    borderBottomWidth: 4,
  },
  locked: {
    backgroundColor: colors.anchor,
    borderColor: colors.wood,
    borderBottomWidth: 1.5,
  },
  selected: {
    borderColor: colors.selected,
    borderWidth: 2.5,
    borderBottomWidth: 4,
  },
  dragged: { opacity: 0.3 },
  word: { color: colors.ink, fontWeight: '700' },
  value: {
    position: 'absolute',
    right: 5,
    bottom: 2,
    fontSize: 10,
    fontWeight: '700',
    color: colors.inkSoft,
  },
});
