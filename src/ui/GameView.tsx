import { router } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

import { analyticsAvailable, track, type EventProps } from '../analytics';
import type { BoosterKind } from '../core/economy';
import { canSubmit, entryWords, isBoardFull, submitLimit, verdictFor, type GameState } from '../core/game';
import { hintLine } from '../core/levelBot';
import type { RunAction } from '../core/run';
import type { CellKey, Entry, LevelDef, Tier, Tile } from '../core/types';
import { displayWord } from '../core/words';
import { THEMES } from '../data/themes';
import { useWallet, wallet } from '../economy';
import { useRemoteConfig } from '../remote';
import { useReduceMotion, useSettings } from '../settings';
import { Board, boardCellSize } from './Board';
import { BoosterSheet } from './BoosterSheet';
import { Confetti } from './Confetti';
import { DragProvider, type DragSource, type ZoneId } from './drag';
import { haptic, playSound, type HapticKind, type SoundName } from './feedback';
import { HandTray } from './HandTray';
import { LevelGoals } from './LevelGoals';
import { OwlPanel } from './OwlPanel';
import { ResultOverlay, type ResultAction } from './ResultOverlay';
import { colors, TIER_LABEL } from './theme';
import { useGame, type GameOptions } from './useGame';
import { useReveal } from './useReveal';
import { WildcardPicker } from './WildcardPicker';

const TIER_FEEDBACK: Record<Tier, [SoundName, HapticKind]> = {
  invalid: ['invalid', 'error'],
  ok: ['ok', 'tap'],
  great: ['great', 'success'],
  poetic: ['poetic', 'success'],
};

type Selection = { kind: 'hand'; tileId: number } | { kind: 'cell'; cell: CellKey } | null;

/** What play stats say about a game: its mode, and the level's number or the daily's day. */
export interface GameStats {
  mode: 'level' | 'daily' | 'zen';
  number?: number;
  day?: string;
}

/**
 * One board, played: the level, daily puzzle and zen screens all use this,
 * each with their own result-card buttons and their own saving.
 */
export function GameView({
  level,
  title,
  backLabel,
  options,
  onChange,
  heading,
  actions,
  newBest,
  note,
  stats,
  economy = false,
}: {
  level: LevelDef;
  title: string;
  backLabel: string;
  options?: GameOptions;
  stats: GameStats;
  /** Hearts and boosters apply: losing costs a heart, and feathers buy boosters. */
  economy?: boolean;
  /** Called whenever the game changes, with its run log (to save progress). */
  onChange?: (state: GameState, log: readonly RunAction[]) => void;
  /** The result card's title. */
  heading: (state: GameState) => string;
  /** The result card's buttons ("See the owl's verdicts" is always there too). */
  actions: (state: GameState) => ResultAction[];
  newBest?: (state: GameState) => boolean;
  /** A line under the score on the result card, e.g. a streak. */
  note?: (state: GameState) => string | null;
}) {
  const { state, log, dispatch, submit, error, mode, notice, corrections, correct, say } = useGame(
    level,
    options,
  );
  const still = useReduceMotion();
  const { economy: economyConfig } = useRemoteConfig();
  const { feathers } = useWallet();
  const { analytics: statsOn } = useSettings();
  const boosters = economy && economyConfig.boosters.enabled;
  const [boosting, setBoosting] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [highlightedEntry, setHighlightedEntry] = useState<string | null>(null);
  /** The result card is hidden while the player reviews the verdicts of a finished game. */
  const [reviewing, setReviewing] = useState(false);
  /** A wildcard on its way to a cell, waiting for the player to pick its word. */
  const [wildcardTarget, setWildcardTarget] = useState<{ tileId: number; cell: CellKey } | null>(
    null,
  );
  const finished = state.phase === 'won' || state.phase === 'lost';
  const { width, height } = useWindowDimensions();

  const latestOnChange = useRef(onChange);
  useLayoutEffect(() => {
    latestOnChange.current = onChange;
  });
  useEffect(() => {
    latestOnChange.current?.(state, log);
  }, [state, log]);

  // Play stats: the game's start, each counted submit, its end, or leaving part-way.
  const statsProps = useMemo<EventProps>(() => {
    const props: EventProps = { mode: stats.mode, level: level.id };
    if (stats.number !== undefined) props.number = stats.number;
    if (stats.day !== undefined) props.day = stats.day;
    return props;
  }, [stats.mode, stats.number, stats.day, level.id]);
  const resumed = (options?.resume?.length ?? 0) > 0;
  const latest = useRef({ state, log });
  useLayoutEffect(() => {
    latest.current = { state, log };
  });
  useEffect(() => {
    track('game_start', { ...statsProps, resumed });
    return () => {
      const { state: last, log: moves } = latest.current;
      if (last.phase === 'playing' && moves.length > 0) {
        track('game_quit', { ...statsProps, submits: last.submitsUsed, moves: moves.length });
      }
    };
  }, [statsProps, resumed]);

  const seen = useRef({ submits: state.submitsUsed, finished });
  useEffect(() => {
    const before = seen.current;
    seen.current = { submits: state.submitsUsed, finished };
    const result = state.lastResult;
    if (state.submitsUsed > before.submits && result) {
      track('game_submit', {
        ...statsProps,
        submit: state.submitsUsed,
        score: result.total,
        passed: result.passed,
        valid: state.entries.filter((e) => verdictFor(state, e)?.valid).length,
        lines: state.entries.length,
      });
    }
    if (finished && !before.finished) {
      const won = state.phase === 'won';
      track('game_end', {
        ...statsProps,
        won,
        score: won ? (result?.total ?? 0) : 0,
        stars: won ? (result?.stars ?? 0) : 0,
        submits: state.submitsUsed,
        swaps_left: state.swapsLeft,
        boosted: state.boosts > 0,
      });
      // Losing a level costs a heart ("One more submit" gives it back).
      if (economy && !won) wallet.loseLife();
    }
  }, [state, finished, statsProps, economy]);

  const contentWidth = Math.min(width, 520) - 32;
  const rows = level.layout.length;
  const cellSize = Math.min(
    boardCellSize(level.layout, contentWidth),
    Math.floor((height * 0.38 - 4 * (rows - 1)) / rows),
  );

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

  const buy = (kind: BoosterKind) => {
    const cost = economyConfig.boosters[kind].cost;
    setBoosting(false);
    if (kind === 'hint') {
      const hint = hintLine(state);
      if (!hint) {
        say("I can't make a line from this hand. A swap might help, and the hint is still yours.");
        return;
      }
      if (!wallet.spend(cost)) return;
      const words = hint.entry.cells.map((cell) => {
        const place = hint.places.find((p) => p.cell === cell);
        const tile = place ? state.hand.find((t) => t.id === place.tileId) : state.board[cell];
        return displayWord(tile?.word ?? '');
      });
      dispatch({ type: 'hint', places: hint.places });
      setHighlightedEntry(hint.entry.id);
      say(`${hint.entry.id}: how about “${words.join(' ')}”?`);
    } else if (kind === 'swaps') {
      if (!wallet.spend(cost)) return;
      const { count } = economyConfig.boosters.swaps;
      dispatch({ type: 'addSwaps', count });
      say(`${count} more swaps. Spend them wisely.`);
    } else if (kind === 'wildcard') {
      if (selection?.kind !== 'hand' || !wallet.spend(cost)) return;
      dispatch({ type: 'makeWildcard', tileId: selection.tileId });
      setSelection(null);
      say('A wildcard! Put it on the board and pick any word.');
    } else {
      return;
    }
    playSound('great');
    haptic('success');
    track('booster', { ...statsProps, kind, cost });
  };

  /** On a lost level: one more submit, carrying on from the same board. */
  const continueActions = (): ResultAction[] => {
    if (!boosters || state.phase !== 'lost') return [];
    const cost = economyConfig.boosters.submit.cost;
    const affordable = feathers >= cost;
    return [
      {
        label: affordable ? `One more submit · ${cost} 🪶` : `One more submit · needs ${cost} 🪶`,
        primary: true,
        disabled: !affordable,
        testID: 'one-more-submit',
        onPress: () => {
          if (!wallet.spend(cost)) return;
          dispatch({ type: 'extraSubmit' });
          wallet.gainLife();
          say('One more go. Make it count.');
          track('booster', { ...statsProps, kind: 'submit', cost });
        },
      },
    ];
  };

  const resultActions = (): ResultAction[] => {
    const extra = continueActions();
    const own = actions(state);
    return extra.length ? [...extra, ...own.map((a) => ({ ...a, primary: false }))] : own;
  };

  const theme = THEMES[level.theme];
  const filled = state.entries.filter((e) => entryWords(state, e)).length;
  const submitsLeft = submitLimit(state) - state.submitsUsed;

  return (
    <SafeAreaView style={styles.screen}>
      <DragProvider onDrop={onDrop}>
        <View style={[styles.column, { width: contentWidth }]}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
              <Text style={styles.back}>‹ {backLabel}</Text>
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>
              {theme.emoji} {title}
            </Text>
            {level.zen ? (
              <Text style={styles.submits} accessibilityLabel="Unlimited submits">
                ∞
              </Text>
            ) : (
              <Text style={styles.submits} accessibilityLabel={`${submitsLeft} submits left`}>
                {'●'.repeat(submitsLeft)}
                <Text style={styles.submitsUsed}>{'●'.repeat(state.submitsUsed)}</Text>
              </Text>
            )}
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
              {boosters && (
                <ActionButton
                  label="🪶"
                  narrow
                  onPress={() => setBoosting(true)}
                  enabled={playing}
                  accessibilityLabel="Boosters"
                  testID="boosters"
                />
              )}
              {selection?.kind === 'cell' ? (
                <ActionButton label="Return to hand" onPress={returnSelected} enabled={playing} />
              ) : (
                <ActionButton
                  label={level.zen ? 'Swap' : `Swap (${state.swapsLeft})`}
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

        <BoosterSheet
          visible={boosting}
          economy={economyConfig}
          feathers={feathers}
          selectedWord={selection?.kind === 'hand' ? (state.hand.find((t) => t.id === selection.tileId)?.word ?? null) : null}
          swapsLeft={state.swapsLeft}
          onBuy={buy}
          onClose={() => setBoosting(false)}
        />

        {!reviewing && !reveal.active && finished && (
          <ResultOverlay
            state={state}
            heading={heading(state)}
            newBest={newBest?.(state) ?? false}
            note={note?.(state) ?? null}
            still={still}
            actions={resultActions()}
            onReview={() => setReviewing(true)}
            onRate={
              analyticsAvailable && statsOn && stats.mode !== 'zen'
                ? (rating) => track('rating', { ...statsProps, rating })
                : undefined
            }
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
  narrow,
  enabled,
  onPress,
  accessibilityLabel,
  testID,
}: {
  label: string;
  primary?: boolean;
  /** Just wide enough for an icon. */
  narrow?: boolean;
  enabled: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !enabled }}
      testID={testID}
      style={[
        styles.action,
        narrow && styles.actionNarrow,
        primary && styles.actionPrimary,
        !enabled && styles.actionDisabled,
      ]}
    >
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
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
  actionNarrow: { flex: 0, paddingHorizontal: 14 },
  actionPrimary: { backgroundColor: colors.wood },
  actionDisabled: { opacity: 0.4 },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.wood },
  actionTextPrimary: { color: colors.white },
});
