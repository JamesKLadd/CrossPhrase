import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_SUBMITS } from '../../core/config';
import { canSubmit, entryWords, isBoardFull } from '../../core/game';
import type { CellKey, Entry, LevelDef, Tier, Tile } from '../../core/types';
import { LEVEL_IDS, LEVELS, levelById, levelNumber } from '../../data/levels';
import { THEMES } from '../../data/themes';
import { isUnlocked, progress, useProgress } from '../../progress';
import { useReduceMotion } from '../../settings';
import { Board, boardCellSize } from '../../ui/Board';
import { Confetti } from '../../ui/Confetti';
import { DragProvider, type DragSource, type ZoneId } from '../../ui/drag';
import { haptic, playSound, type HapticKind, type SoundName } from '../../ui/feedback';
import { HandTray } from '../../ui/HandTray';
import { LevelGoals } from '../../ui/LevelGoals';
import { OwlPanel } from '../../ui/OwlPanel';
import { ResultOverlay } from '../../ui/ResultOverlay';
import { colors, TIER_LABEL } from '../../ui/theme';
import { useGame } from '../../ui/useGame';
import { useReveal } from '../../ui/useReveal';
import { WildcardPicker } from '../../ui/WildcardPicker';

const TIER_FEEDBACK: Record<Tier, [SoundName, HapticKind]> = {
  invalid: ['invalid', 'error'],
  ok: ['ok', 'tap'],
  great: ['great', 'success'],
  poetic: ['poetic', 'success'],
};

type Selection = { kind: 'hand'; tileId: number } | { kind: 'cell'; cell: CellKey } | null;

export default function PlayScreen() {
  const { levelId } = useLocalSearchParams<{ levelId: string }>();
  const level = levelById(levelId);
  const saved = useProgress();
  const [attempt, setAttempt] = useState(0);
  if (!level) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.missing}>No level called “{levelId}”.</Text>
      </SafeAreaView>
    );
  }
  const number = levelNumber(level.id);
  if (!isUnlocked(saved, LEVEL_IDS, number - 1)) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.missing}>
          Level {number} is locked. Clear level {number - 1} first.
        </Text>
        <Pressable onPress={() => router.replace('/')} style={styles.lockedBack}>
          <Text style={styles.back}>‹ Levels</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  // Keyed so moving to the next level, or replaying, starts a fresh game.
  return <Game key={`${level.id}:${attempt}`} level={level} onReplay={() => setAttempt((a) => a + 1)} />;
}

const bestScore = (levelId: string) => progress.snapshot().levels[levelId]?.best ?? null;

function Game({ level, onReplay }: { level: LevelDef; onReplay: () => void }) {
  const { state, dispatch, submit, error, mode, notice, corrections, correct } = useGame(level);
  const still = useReduceMotion();
  const [confetti, setConfetti] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [highlightedEntry, setHighlightedEntry] = useState<string | null>(null);
  /** The result card is hidden while the player reviews the verdicts of a finished level. */
  const [reviewing, setReviewing] = useState(false);
  /** A wildcard on its way to a cell, waiting for the player to pick its word. */
  const [wildcardTarget, setWildcardTarget] = useState<{ tileId: number; cell: CellKey } | null>(
    null,
  );
  /** The best score before this attempt, to spot a new best. */
  const [previousBest] = useState(() => bestScore(level.id));
  const finished = state.phase === 'won' || state.phase === 'lost';
  const { width, height } = useWindowDimensions();
  const number = levelNumber(level.id);

  // Save every clear. A re-check after an offline win can raise the score, so this runs again then.
  const { phase, lastResult } = state;
  useEffect(() => {
    if (phase === 'won' && lastResult) progress.record(level.id, lastResult);
  }, [phase, lastResult, level.id]);
  const newBest =
    phase === 'won' && previousBest !== null && (lastResult?.total ?? 0) > previousBest;

  const contentWidth = Math.min(width, 520) - 32;
  const rows = level.layout.length;
  const cellSize = Math.min(
    boardCellSize(level.layout, contentWidth),
    Math.floor((height * 0.38 - 4 * (rows - 1)) / rows),
  );
  const next = LEVELS[number];

  // Verdicts appear one line at a time, each with its own sound and the owl's reaction.
  const reveal = useReveal(
    state,
    still,
    (entry: Entry, tier: Tier) => {
      const [sound, buzz] = TIER_FEEDBACK[tier];
      playSound(sound);
      haptic(buzz);
      if (tier === 'poetic' && !still) setConfetti((c) => c + 1);
      AccessibilityInfo.announceForAccessibility(`${entry.id}: ${TIER_LABEL[tier]}`);
    },
    () => {
      if (state.phase === 'won') {
        playSound('win');
        haptic('success');
        if (!still) setConfetti((c) => c + 1);
      } else if (state.phase === 'lost') {
        playSound('lose');
        haptic('warning');
      }
    },
  );
  const playing = state.phase === 'playing' && !reveal.active;

  const highlighted = useMemo(
    () => new Set(state.entries.find((e) => e.id === highlightedEntry)?.cells ?? []),
    [state.entries, highlightedEntry],
  );

  const onTilePress = (tile: Tile) => {
    playSound('tap');
    haptic('select');
    setSelection((s) =>
      s?.kind === 'hand' && s.tileId === tile.id ? null : { kind: 'hand', tileId: tile.id },
    );
  };

  /** Places a hand tile, asking for a word first if it's a wildcard. */
  const place = (tileId: number, cell: CellKey) => {
    const tile = state.hand.find((t) => t.id === tileId);
    const target = state.board[cell];
    if (!tile || target === undefined || target?.anchor) return;
    if (tile.wildcard) setWildcardTarget({ tileId, cell });
    else dispatch({ type: 'place', tileId, cell });
  };

  const onCellPress = (cell: CellKey) => {
    if (selection?.kind === 'hand') {
      place(selection.tileId, cell);
      setSelection(null);
    } else if (selection?.kind === 'cell') {
      if (selection.cell !== cell) dispatch({ type: 'move', from: selection.cell, to: cell });
      setSelection(null);
    } else if (state.board[cell] && !state.board[cell].anchor) {
      playSound('tap');
      haptic('select');
      setSelection({ kind: 'cell', cell });
    }
  };

  const onDrop = (source: DragSource, zone: ZoneId | null) => {
    setSelection(null);
    if (zone === null) return;
    if (zone === 'hand') {
      if (source.kind === 'cell') dispatch({ type: 'remove', cell: source.cell });
      return;
    }
    const cell = zone.slice('cell:'.length) as CellKey;
    if (source.kind === 'hand') place(source.tileId, cell);
    else dispatch({ type: 'move', from: source.cell, to: cell });
  };

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
              {theme.emoji} {number}. {level.name}
            </Text>
            <Text style={styles.submits}>
              {'●'.repeat(MAX_SUBMITS - state.submitsUsed)}
              <Text style={styles.submitsUsed}>{'●'.repeat(state.submitsUsed)}</Text>
            </Text>
          </View>
          <LevelGoals state={state} />

          <View style={styles.board}>
            <Board
              state={state}
              cellSize={cellSize}
              selectedCell={selection?.kind === 'cell' ? selection.cell : null}
              highlighted={highlighted}
              shown={reveal.shown}
              enabled={playing}
              still={still}
              onCellPress={onCellPress}
            />
          </View>

          <ScrollView style={styles.owlScroll} contentContainerStyle={styles.owlContent}>
            <OwlPanel
              state={state}
              reveal={reveal}
              still={still}
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
                  state.phase === 'judging' || reveal.active
                    ? 'Judging…'
                    : canSubmit(state)
                      ? 'Submit'
                      : isBoardFull(state)
                        ? 'Change a line first'
                        : `${filled}/${state.entries.length} lines filled`
                }
                primary
                onPress={submit}
                enabled={canSubmit(state) && !reveal.active}
              />
            </View>
          )}
        </View>

        <WildcardPicker
          theme={level.theme}
          visible={wildcardTarget !== null}
          onPick={(word) => {
            if (wildcardTarget) dispatch({ type: 'place', ...wildcardTarget, word });
            setWildcardTarget(null);
          }}
          onCancel={() => setWildcardTarget(null)}
        />

        {!reviewing && !reveal.active && (
          <ResultOverlay
            state={state}
            levelNumber={number}
            newBest={newBest}
            still={still}
            hasNext={next !== undefined}
            onNext={() => router.replace(`/play/${next!.id}`)}
            onRetry={onReplay}
            onExit={() => router.back()}
            onReview={() => setReviewing(true)}
          />
        )}
        <Confetti burst={confetti} />
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
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      style={[styles.action, primary && styles.actionPrimary, !enabled && styles.actionDisabled]}
    >
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  missing: { margin: 24, fontSize: 16, color: colors.ink },
  lockedBack: { marginHorizontal: 24 },
  column: { flex: 1, alignSelf: 'center', paddingVertical: 8, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { fontSize: 15, fontWeight: '700', color: colors.wood },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  submits: { fontSize: 14, color: colors.wood, letterSpacing: 2 },
  submitsUsed: { color: colors.tileEdge },
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
