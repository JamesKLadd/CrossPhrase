import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { tileValue } from '../core/scoring';
import { WILDCARD } from '../core/types';
import { displayWord } from '../core/words';
import { useDraggable, type DragSource } from './drag';
import { colors, wordFontSize } from './theme';

export function WordTile({
  word,
  size,
  source,
  selected,
  locked,
  wildcard,
  enabled,
  onTap,
}: {
  word: string;
  size: number;
  source: DragSource;
  selected: boolean;
  /** Anchors: shown differently and never draggable. */
  locked?: boolean;
  /** A wildcard: blank until placed, then marked with a star. */
  wildcard?: boolean;
  enabled: boolean;
  onTap: () => void;
}) {
  const { ref, gesture, isDragged } = useDraggable({
    source,
    word,
    size,
    enabled: enabled && !locked,
    onTap,
  });

  const blank = wildcard && word === WILDCARD;
  const label = blank
    ? 'Wildcard, can be any word'
    : `${displayWord(word)}${locked ? ', anchored' : `, ${tileValue({ word, wildcard })} points`}${wildcard ? ', wildcard' : ''}`;
  return (
    <GestureDetector gesture={gesture}>
      <View
        ref={ref}
        collapsable={false}
        testID={blank ? 'tile-wildcard' : `tile-${word}`}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled: !enabled || locked }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'activate' && enabled && !locked) onTap();
        }}
        style={[
          styles.tile,
          { width: size, height: size },
          locked && styles.locked,
          wildcard && styles.wildcard,
          selected && styles.selected,
          isDragged && styles.dragged,
        ]}
      >
        <Text
          numberOfLines={1}
          allowFontScaling={false}
          style={[
            styles.word,
            { fontSize: blank ? size * 0.42 : wordFontSize(word, size) },
            blank && styles.star,
          ]}
        >
          {displayWord(word)}
        </Text>
        {blank && (
          <Text style={styles.anyWord} allowFontScaling={false}>
            any word
          </Text>
        )}
        {wildcard && !blank && (
          <Text style={styles.wildMark} allowFontScaling={false}>
            ★
          </Text>
        )}
        {!locked && !blank && (
          <Text style={styles.value} allowFontScaling={false}>
            {tileValue({ word, wildcard })}
          </Text>
        )}
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
  wildcard: { backgroundColor: colors.wildcard, borderColor: colors.selected },
  dragged: { opacity: 0.3 },
  word: { color: colors.ink, fontWeight: '700' },
  star: { color: colors.selected },
  anyWord: { fontSize: 9, fontWeight: '700', color: colors.inkSoft, marginTop: -2 },
  wildMark: {
    position: 'absolute',
    right: 5,
    top: 2,
    fontSize: 10,
    color: colors.selected,
  },
  value: {
    position: 'absolute',
    right: 5,
    bottom: 2,
    fontSize: 10,
    fontWeight: '700',
    color: colors.inkSoft,
  },
});
