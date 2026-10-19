import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { MAX_SUBMITS, TIER_MULTIPLIER } from '../core/config';
import { entryTiles, hasNewPhrases, phraseKey, verdictFor, type GameState } from '../core/game';
import { owlLine } from '../core/quips';
import { starThresholds, tileValue } from '../core/scoring';
import type { Tier } from '../core/types';
import { displayWord } from '../core/words';
import type { JudgeMode } from '../judge';
import { haptic, playSound } from './feedback';
import { Owl, type OwlMood } from './Owl';
import { colors, TIER_ICON, TIER_LABEL, useTierColors } from './theme';
import { Typewriter } from './Typewriter';
import type { Reveal } from './useReveal';

export const TIER_MOOD: Record<Tier, OwlMood> = {
  invalid: 'disappointed',
  ok: 'pleased',
  great: 'delighted',
  poetic: 'dazzled',
};

/** How the owl looks right now, from the state of the game. */
export function owlMood(state: GameState, reveal: Reveal): OwlMood {
  if (state.phase === 'judging') return 'thinking';
  if (reveal.active) {
    const verdict = reveal.current && verdictFor(state, reveal.current);
    return verdict ? TIER_MOOD[verdict.tier] : 'thinking';
  }
  if (state.phase === 'won') return state.lastResult?.stars === 3 ? 'dazzled' : 'delighted';
  if (state.phase === 'lost') return 'disappointed';
  // Unimpressed after a failed submit, until there's something new to look at.
  if (state.lastResult && !state.lastResult.passed && !hasNewPhrases(state)) return 'disappointed';
  return 'idle';
}

function speech(
  state: GameState,
  reveal: Reveal,
  error: string | null,
  mode: JudgeMode | null,
  notice: string | null,
): string {
  const seed = `${state.level.id}:${state.submitsUsed}`;
  if (state.phase === 'judging') return owlLine('judging', seed);
  if (error) return "Something went wrong on my end, so that submit wasn't counted. Try again.";
  if (reveal.active) {
    const verdict = reveal.current && verdictFor(state, reveal.current);
    if (!verdict) return '…';
    return `${reveal.current!.id}: ${verdict.provisional ? 'Graded offline; I will double-check. ' : ''}${verdict.quip}`;
  }
  if (notice) return notice;
  const result = state.lastResult;
  if (result && mode === 'offline') return owlLine('offline', seed);
  if (!result) return state.level.intro ?? owlLine('intro', state.level.id, { submits: MAX_SUBMITS });
  if (state.phase === 'won') return owlLine(`win${result.stars as 1 | 2 | 3}`, seed);
  if (state.phase === 'lost') return owlLine('lose', seed);
  const remaining = MAX_SUBMITS - state.submitsUsed;
  const left = `${remaining} submit${remaining === 1 ? '' : 's'}`;
  if (state.entries.some((e) => verdictFor(state, e)?.tier === 'invalid')) {
    return owlLine('fixLines', seed, { left });
  }
  return owlLine('short', seed, { score: result.total, need: starThresholds(state.level)[0], left });
}

export function OwlPanel({
  state,
  reveal,
  still,
  error,
  mode,
  notice,
  highlighted,
  onEntryPress,
  corrections,
  onCorrect,
}: {
  state: GameState;
  reveal: Reveal;
  /** Reduced motion: no typing, bobbing or hopping. */
  still: boolean;
  error: string | null;
  mode: JudgeMode | null;
  notice: string | null;
  highlighted: string | null;
  onEntryPress: (entryId: string) => void;
  /** Phrases the player has already corrected, with the tier they gave. */
  corrections: ReadonlyMap<string, Tier>;
  onCorrect: (phrase: string, judged: Tier, tier: Tier) => void;
}) {
  const judging = state.phase === 'judging';
  const tierColors = useTierColors();
  /** The line whose "Wrong?" picker is open. */
  const [correcting, setCorrecting] = useState<string | null>(null);
  /** Pokes at the owl; its reply lasts until the game moves on. */
  const [poke, setPoke] = useState<{ count: number; state: GameState | null }>({ count: 0, state: null });
  const poked = poke.state === state;
  const mood = owlMood(state, reveal);

  const onPoke = () => {
    playSound('hoot');
    haptic('tap');
    setPoke((p) => ({ count: p.count + 1, state }));
  };
  const text = poked ? owlLine('poke', String(poke.count)) : speech(state, reveal, error, mode, notice);

  return (
    <View style={styles.panel}>
      <View style={styles.speechRow}>
        <Pressable onPress={onPoke} accessibilityRole="button" accessibilityLabel="The owl" testID="owl">
          <Owl
            size={60}
            mood={mood}
            reaction={state.submitsUsed * 100 + reveal.shown + poke.count * 1000}
            still={still}
          />
        </Pressable>
        <View style={styles.bubble}>
          <Typewriter text={text} still={still} style={styles.speech} />
          {judging && <ActivityIndicator color={colors.wood} style={styles.spinner} />}
        </View>
      </View>

      {state.submitsUsed > 0 && (
        <View style={styles.entries}>
          {state.entries.slice(0, reveal.shown).map((entry) => {
            const tiles = entryTiles(state, entry);
            const words = tiles?.map((t) => t.word) ?? null;
            const verdict = verdictFor(state, entry);
            const base = tiles?.reduce((sum, t) => sum + tileValue(t), 0) ?? 0;
            const phrase = words && phraseKey(words);
            const corrected = phrase ? corrections.get(phrase) : undefined;
            return (
              <Pressable
                key={entry.id}
                onPress={() => onEntryPress(entry.id)}
                style={[styles.entry, highlighted === entry.id && styles.entryHighlighted]}
              >
                <View style={styles.entryHead}>
                  <Text style={styles.entryId}>{entry.id}</Text>
                  <Text style={styles.phrase} numberOfLines={1}>
                    {(verdict?.reading.split(' ') ?? words)?.map(displayWord).join(' ') || '…'}
                  </Text>
                  {verdict ? (
                    <Text
                      style={[
                        styles.badge,
                        { backgroundColor: tierColors[verdict.tier] },
                        verdict.provisional && styles.badgeProvisional,
                      ]}
                    >
                      {TIER_ICON[verdict.tier]} {TIER_LABEL[verdict.tier]}
                      {verdict.provisional ? '?' : ''}
                      {verdict.valid ? ` +${Math.round(base * TIER_MULTIPLIER[verdict.tier])}` : ''}
                    </Text>
                  ) : (
                    <Text style={styles.unjudged}>not judged</Text>
                  )}
                </View>
                {verdict && (
                  <View style={styles.detail}>
                    <Text style={styles.quip}>
                      {verdict.reason ? `${verdict.reason}. ` : ''}
                      <Text style={styles.quipItalic}>
                        {verdict.provisional ? 'Graded offline. I will double-check.' : verdict.quip}
                      </Text>
                    </Text>
                    {phrase &&
                      (corrected ? (
                        <Text style={styles.corrected}>You said {TIER_LABEL[corrected]}</Text>
                      ) : (
                        <Pressable
                          onPress={() => setCorrecting(correcting === phrase ? null : phrase)}
                          hitSlop={8}
                        >
                          <Text style={styles.wrong}>Wrong?</Text>
                        </Pressable>
                      ))}
                  </View>
                )}
                {verdict && phrase && correcting === phrase && !corrected && (
                  <View style={styles.picker}>
                    <Text style={styles.pickerLabel}>It should be:</Text>
                    {(['invalid', 'ok', 'great', 'poetic'] as const).map((tier) => (
                      <Pressable
                        key={tier}
                        onPress={() => {
                          setCorrecting(null);
                          onCorrect(phrase, verdict.tier, tier);
                        }}
                        style={[styles.chip, { borderColor: tierColors[tier] }]}
                      >
                        <Text style={[styles.chipText, { color: tierColors[tier] }]}>
                          {TIER_ICON[tier]} {TIER_LABEL[tier]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { alignSelf: 'stretch', gap: 10 },
  speechRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bubble: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 14,
    borderTopLeftRadius: 2,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.tileEdge,
  },
  speech: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 19 },
  spinner: { marginLeft: 8 },
  entries: { gap: 6 },
  entry: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.cell,
    borderWidth: 1,
    borderColor: colors.tileEdge,
  },
  entryHighlighted: { borderColor: colors.selected, borderWidth: 2 },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryId: { width: 28, fontWeight: '800', color: colors.inkSoft },
  phrase: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  badge: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    color: colors.white,
    fontWeight: '800',
    fontSize: 12,
  },
  unjudged: { fontSize: 12, color: colors.inkSoft, fontStyle: 'italic' },
  badgeProvisional: { opacity: 0.6 },
  detail: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4, marginLeft: 36 },
  quip: { flex: 1, fontSize: 13, color: colors.inkSoft },
  wrong: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.wood,
    textDecorationLine: 'underline',
  },
  corrected: { fontSize: 12, fontStyle: 'italic', color: colors.inkSoft },
  picker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginLeft: 36,
  },
  pickerLabel: { fontSize: 12, color: colors.inkSoft },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1.5 },
  chipText: { fontSize: 12, fontWeight: '800' },
  quipItalic: { fontStyle: 'italic' },
});
