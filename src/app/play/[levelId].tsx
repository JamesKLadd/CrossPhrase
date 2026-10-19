import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_SUBMITS } from '../../core/config';
import { canSubmit, entryWords, isBoardFull } from '../../core/game';
import { starThresholds, wordValue } from '../../core/scoring';
import type { CellKey, LevelDef, Tile } from '../../core/types';
import { LEVELS, levelById } from '../../data/levels';
import { THEMES } from '../../data/themes';
import { Board, boardCellSize } from '../../ui/Board';
import { DragProvider, type DragSource, type ZoneId } from '../../ui/drag';
import { HandTray } from '../../ui/HandTray';
import { OwlPanel } from '../../ui/OwlPanel';
import { ResultOverlay } from '../../ui/ResultOverlay';
import { colors } from '../../ui/theme';
import { useGame } from '../../ui/useGame';

type Selection = { kind: 'hand'; tileId: number } | { kind: 'cell'; cell: CellKey } | null;

export default function PlayScreen() {
  const { levelId } = useLocalSearchParams<{ levelId: string }>();
  const level = levelById(levelId);
  if (!level) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.missing}>No level called “{levelId}”.</Text>
      </SafeAreaView>
    );
  }
  // Keyed so moving to the next level starts a fresh game.
  return <Game key={level.id} level={level} />;
}

function Game({ level }: { level: LevelDef }) {
  const { state, dispatch, submit, restart, error, mode, notice, corrections, correct } =
    useGame(level);
  const [selection, setSelection] = useState<Selection>(null);
  const [highlightedEntry, setHighlightedEntry] = useState<string | null>(null);
  /** The result card is hidden while the player reviews the verdicts of a finished level. */
  const [reviewing, setReviewing] = useState(false);
  const finished = state.phase === 'won' || state.phase === 'lost';
  const { width, height } = useWindowDimensions();

  const contentWidth = Math.min(width, 520) - 32;
  const rows = level.layout.length;
  const cellSize = Math.min(
    boardCellSize(level.layout, contentWidth),
    Math.floor((height * 0.38 - 4 * (rows - 1)) / rows),
  );
  const levelIndex = LEVELS.findIndex((l) => l.id === level.id);
  const next = LEVELS[levelIndex + 1];
  const playing = state.phase === 'playing';
  const stars = starThresholds(level);
  const boardValue = state.entries.reduce(
    (sum, entry) =>
      sum +
      entry.cells.reduce((s, c) => s + (state.board[c] ? wordValue(state.board[c].word) : 0), 0),
    0,
  );

  const highlighted = useMemo(
    () => new Set(state.entries.find((e) => e.id === highlightedEntry)?.cells ?? []),
    [state.entries, highlightedEntry],
  );

  const onTilePress = (tile: Tile) =>
    setSelection((s) =>
      s?.kind === 'hand' && s.tileId === tile.id ? null : { kind: 'hand', tileId: tile.id },
    );

  const onCellPress = (cell: CellKey) => {
    if (selection?.kind === 'hand') {
      dispatch({ type: 'place', tileId: selection.tileId, cell });
      setSelection(null);
    } else if (selection?.kind === 'cell') {
      if (selection.cell !== cell) dispatch({ type: 'move', from: selection.cell, to: cell });
      setSelection(null);
    } else if (state.board[cell] && !state.board[cell].anchor) {
      setSelection({ kind: 'cell', cell });
    }
  };

  const onDrop = useCallback(
    (source: DragSource, zone: ZoneId | null) => {
      setSelection(null);
      if (zone === null) return;
      if (zone === 'hand') {
        if (source.kind === 'cell') dispatch({ type: 'remove', cell: source.cell });
        return;
      }
      const cell = zone.slice('cell:'.length) as CellKey;
      if (source.kind === 'hand') dispatch({ type: 'place', tileId: source.tileId, cell });
      else dispatch({ type: 'move', from: source.cell, to: cell });
    },
    [dispatch],
  );

  const swapSelected = () => {
    if (selection?.kind !== 'hand') return;
    dispatch({ type: 'swap', tileId: selection.tileId });
    setSelection(null);
  };

  const returnSelected = () => {
    if (selection?.kind !== 'cell') return;
    dispatch({ type: 'remove', cell: selection.cell });
    setSelection(null);
  };

  const theme = THEMES[level.theme];
  const filled = state.entries.filter((e) => entryWords(state, e)).length;

  return (
    <SafeAreaView style={styles.screen}>
      <DragProvider onDrop={onDrop}>
        <View style={[styles.column, { width: contentWidth }]}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.back}>‹ Levels</Text>
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>
              {theme.emoji} {level.name}
            </Text>
            <Text style={styles.submits}>
              {'●'.repeat(MAX_SUBMITS - state.submitsUsed)}
              <Text style={styles.submitsUsed}>{'●'.repeat(state.submitsUsed)}</Text>
            </Text>
          </View>
          <Text style={styles.targets}>
            Board value {boardValue} · ★ {stars[0]} · ★★ {stars[1]} · ★★★ {stars[2]}
          </Text>

          <View style={styles.board}>
            <Board
              state={state}
              cellSize={cellSize}
              selectedCell={selection?.kind === 'cell' ? selection.cell : null}
              highlighted={highlighted}
              onCellPress={onCellPress}
            />
          </View>

          <ScrollView style={styles.owlScroll} contentContainerStyle={styles.owlContent}>
            <OwlPanel
              state={state}
              error={error}
              mode={mode}
              notice={notice}
              highlighted={highlightedEntry}
              onEntryPress={(id) => setHighlightedEntry((h) => (h === id ? null : id))}
              corrections={corrections}
              onCorrect={correct}
            />
          </ScrollView>

          <HandTray
            hand={state.hand}
            enabled={playing}
            selectedTile={selection?.kind === 'hand' ? selection.tileId : null}
            onTilePress={onTilePress}
          />

          {finished && reviewing ? (
            <View style={styles.actions}>
              <ActionButton
                label="Done reviewing"
                primary
                onPress={() => setReviewing(false)}
                enabled
              />
            </View>
          ) : (
            <View style={styles.actions}>
              {selection?.kind === 'cell' ? (
                <ActionButton label="Return to hand" onPress={returnSelected} enabled={playing} />
              ) : (
                <ActionButton
                  label={`Swap (${state.swapsLeft})`}
                  onPress={swapSelected}
                  enabled={playing && selection?.kind === 'hand' && state.swapsLeft > 0}
                />
              )}
              <ActionButton
                label={
                  state.phase === 'judging'
                    ? 'Judging…'
                    : canSubmit(state)
                      ? 'Submit'
                      : isBoardFull(state)
                        ? 'Change a line first'
                        : `${filled}/${state.entries.length} lines filled`
                }
                primary
                onPress={submit}
                enabled={canSubmit(state)}
              />
            </View>
          )}
        </View>

        {!reviewing && (
          <ResultOverlay
            state={state}
            hasNext={next !== undefined}
            onNext={() => router.replace(`/play/${next!.id}`)}
            onRetry={() => {
              setSelection(null);
              setReviewing(false);
              restart();
            }}
            onExit={() => router.back()}
            onReview={() => setReviewing(true)}
          />
        )}
      </DragProvider>
    </SafeAreaView>
  );
}

function ActionButton({
  label,
  primary,
  enabled,
  onPress,
}: {
  label: string;
  primary?: boolean;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      style={[styles.action, primary && styles.actionPrimary, !enabled && styles.actionDisabled]}
    >
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  missing: { margin: 24, fontSize: 16, color: colors.ink },
  column: { flex: 1, alignSelf: 'center', paddingVertical: 8, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { fontSize: 15, fontWeight: '700', color: colors.wood },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  submits: { fontSize: 14, color: colors.wood, letterSpacing: 2 },
  submitsUsed: { color: colors.tileEdge },
  targets: { textAlign: 'center', fontSize: 12, color: colors.inkSoft },
  board: { alignItems: 'center', paddingVertical: 4 },
  owlScroll: { flex: 1 },
  owlContent: { paddingBottom: 4 },
  actions: { flexDirection: 'row', gap: 10 },
  action: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.wood,
  },
  actionPrimary: { backgroundColor: colors.wood },
  actionDisabled: { opacity: 0.4 },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.wood },
  actionTextPrimary: { color: colors.white },
});
