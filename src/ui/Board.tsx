import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { verdictFor, type GameState } from '../core/game';
import { cellKey } from '../core/grid';
import type { CellKey, Pos, Tier } from '../core/types';
import { useDropZone } from './drag';
import { colors, POS_LABEL, TIER_ICON, TIER_LABEL, useTierColors } from './theme';
import { WordTile } from './WordTile';

const POS_NAME: Record<Pos, string> = {
  noun: 'noun',
  verb: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  det: 'determiner',
  pron: 'pronoun',
  prep: 'preposition',
  conj: 'conjunction',
  interj: 'interjection',
};

const GAP = 4;

export function boardCellSize(layout: string[], maxWidth: number): number {
  const cols = layout[0].length;
  return Math.floor(Math.min(84, (maxWidth - GAP * (cols - 1)) / cols));
}

/** The worst verdict among the revealed entries through each cell, for tinting. */
function cellTiers(state: GameState, shown: number): Map<CellKey, Tier> {
  const order: Tier[] = ['invalid', 'ok', 'great', 'poetic'];
  const tiers = new Map<CellKey, Tier>();
  for (const entry of state.entries.slice(0, shown)) {
    const verdict = verdictFor(state, entry);
    if (!verdict) continue;
    for (const cell of entry.cells) {
      const existing = tiers.get(cell);
      if (!existing || order.indexOf(verdict.tier) < order.indexOf(existing)) {
        tiers.set(cell, verdict.tier);
      }
    }
  }
  return tiers;
}

export function Board({
  state,
  cellSize,
  selectedCell,
  highlighted,
  shown,
  enabled,
  still,
  onCellPress,
}: {
  state: GameState;
  cellSize: number;
  selectedCell: CellKey | null;
  /** Cells of the entry the player is inspecting. */
  highlighted: ReadonlySet<CellKey>;
  /** How many entries' verdicts have been revealed so far. */
  shown: number;
  /** Whether tiles can be moved (not while judging or revealing). */
  enabled: boolean;
  /** Reduced motion: no popping. */
  still: boolean;
  onCellPress: (cell: CellKey) => void;
}) {
  const { layout, hints } = state.level;
  const numbers = new Map(state.entries.map((e) => [e.cells[0], e.number]));
  const tiers = state.submitsUsed > 0 ? cellTiers(state, shown) : new Map<CellKey, Tier>();
  const tierColors = useTierColors();

  return (
    <View style={{ gap: GAP }}>
      {layout.map((line, row) => (
        <View key={row} style={[styles.row, { gap: GAP }]}>
          {[...line].map((ch, col) => {
            const key = cellKey(row, col);
            if (ch === '#') {
              return <View key={key} style={[styles.blocked, { width: cellSize, height: cellSize }]} />;
            }
            return (
              <Cell
                key={key}
                cell={key}
                size={cellSize}
                state={state}
                number={numbers.get(key)}
                hint={hints?.[key]}
                tier={tiers.get(key)}
                tierColors={tierColors}
                selected={selectedCell === key}
                highlighted={highlighted.has(key)}
                enabled={enabled}
                still={still}
                onPress={() => onCellPress(key)}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Cell({
  cell,
  size,
  state,
  number,
  hint,
  tier,
  tierColors,
  selected,
  highlighted,
  enabled,
  still,
  onPress,
}: {
  cell: CellKey;
  size: number;
  state: GameState;
  number?: number;
  hint?: Pos;
  tier?: Tier;
  tierColors: Record<Tier, string>;
  selected: boolean;
  highlighted: boolean;
  enabled: boolean;
  still: boolean;
  onPress: () => void;
}) {
  const tile = state.board[cell];
  const { ref, hovered } = useDropZone(`cell:${cell}`);
  const [row, col] = cell.split(',').map(Number);

  // A little pop when a tile lands, and again when its line is graded.
  const pop = useSharedValue(1);
  const tileId = tile?.id;
  useEffect(() => {
    if (still || tileId === undefined) return;
    pop.set(withSequence(withTiming(1.12, { duration: 80 }), withSpring(1, { damping: 10 })));
  }, [tileId, tier, still, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  // The drop zone is a plain View (it gets measured); the cell inside it animates.
  return (
    <View ref={ref} collapsable={false} style={{ width: size, height: size }}>
      <Animated.View
        style={[
          styles.cell,
          highlighted && styles.highlighted,
          tier && { borderColor: tierColors[tier], borderWidth: 2.5, borderStyle: 'solid' },
          hovered && styles.hovered,
          popStyle,
        ]}
      >
        {tile ? (
          <WordTile
            word={tile.word}
            size={size - 6}
            source={{ kind: 'cell', cell }}
            selected={selected}
            locked={tile.anchor}
            wildcard={tile.wildcard}
            enabled={enabled}
            onTap={onPress}
          />
        ) : (
          <Pressable
            testID={`cell-${cell}`}
            style={styles.empty}
            onPress={onPress}
            disabled={!enabled}
            accessibilityRole="button"
            accessibilityLabel={`Row ${row + 1}, column ${col + 1}, empty${hint ? `, hint: ${POS_NAME[hint]}` : ''}`}
          >
            {hint && (
              <Text style={styles.hint} maxFontSizeMultiplier={1.2}>
                {POS_LABEL[hint]}
              </Text>
            )}
          </Pressable>
        )}
        {number !== undefined && (
          <Text pointerEvents="none" style={styles.number} maxFontSizeMultiplier={1.2}>
            {number}
          </Text>
        )}
        {tier && (
          <Text
            pointerEvents="none"
            style={[styles.tierIcon, { backgroundColor: tierColors[tier] }]}
            maxFontSizeMultiplier={1}
            accessibilityLabel={TIER_LABEL[tier]}
          >
            {TIER_ICON[tier]}
          </Text>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  blocked: { borderRadius: 8, backgroundColor: colors.blocked },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.cell,
    borderWidth: 1.5,
    borderColor: colors.tileEdge,
    borderStyle: 'dashed',
  },
  highlighted: { backgroundColor: colors.paperDeep },
  hovered: { borderColor: colors.selected, borderWidth: 2.5, borderStyle: 'solid' },
  empty: { alignSelf: 'stretch', flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: {
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.inkSoft,
    backgroundColor: colors.paperDeep,
  },
  number: {
    position: 'absolute',
    left: 5,
    top: 2,
    fontSize: 10,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  tierIcon: {
    position: 'absolute',
    left: -5,
    bottom: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 16,
    fontSize: 10,
    fontWeight: '900',
    color: colors.white,
  },
});
