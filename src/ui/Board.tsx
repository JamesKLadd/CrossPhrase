import { Pressable, StyleSheet, Text, View } from 'react-native';

import { verdictFor, type GameState } from '../core/game';
import { cellKey } from '../core/grid';
import type { CellKey, Tier } from '../core/types';
import { useDropZone } from './drag';
import { colors, POS_LABEL } from './theme';
import { WordTile } from './WordTile';

const GAP = 4;

export function boardCellSize(layout: string[], maxWidth: number): number {
  const cols = layout[0].length;
  return Math.floor(Math.min(84, (maxWidth - GAP * (cols - 1)) / cols));
}

/** The worst verdict among judged entries through each cell, for tinting. */
function cellTiers(state: GameState): Map<CellKey, Tier> {
  const order: Tier[] = ['invalid', 'ok', 'great', 'poetic'];
  const tiers = new Map<CellKey, Tier>();
  for (const entry of state.entries) {
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
  onCellPress,
}: {
  state: GameState;
  cellSize: number;
  selectedCell: CellKey | null;
  /** Cells of the entry the player is inspecting. */
  highlighted: ReadonlySet<CellKey>;
  onCellPress: (cell: CellKey) => void;
}) {
  const { layout, hints } = state.level;
  const numbers = new Map(state.entries.map((e) => [e.cells[0], e.number]));
  const tiers = state.submitsUsed > 0 ? cellTiers(state) : new Map<CellKey, Tier>();

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
                hint={hints?.[key] ? POS_LABEL[hints[key]] : undefined}
                tier={tiers.get(key)}
                selected={selectedCell === key}
                highlighted={highlighted.has(key)}
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
  selected,
  highlighted,
  onPress,
}: {
  cell: CellKey;
  size: number;
  state: GameState;
  number?: number;
  hint?: string;
  tier?: Tier;
  selected: boolean;
  highlighted: boolean;
  onPress: () => void;
}) {
  const tile = state.board[cell];
  const { ref, hovered } = useDropZone(`cell:${cell}`);
  const playing = state.phase === 'playing';

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[
        styles.cell,
        { width: size, height: size },
        highlighted && styles.highlighted,
        tier && { borderColor: colors.tier[tier], borderWidth: 2.5 },
        hovered && styles.hovered,
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
          enabled={playing}
          onTap={onPress}
        />
      ) : (
        <Pressable testID={`cell-${cell}`} style={styles.empty} onPress={onPress} disabled={!playing}>
          {hint && <Text style={styles.hint}>{hint}</Text>}
        </Pressable>
      )}
      {number !== undefined && (
        <Text pointerEvents="none" style={styles.number}>
          {number}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  blocked: { borderRadius: 8, backgroundColor: colors.blocked },
  cell: {
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
});
