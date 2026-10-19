import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { MAX_SUBMITS, TIER_MULTIPLIER } from '../core/config';
import { entryWords, phraseKey, verdictFor, type GameState } from '../core/game';
import { starThresholds, wordValue } from '../core/scoring';
import type { Tier } from '../core/types';
import { displayWord } from '../core/words';
import type { JudgeMode } from '../judge';
import { colors, TIER_LABEL } from './theme';

function speech(
  state: GameState,
  error: string | null,
  mode: JudgeMode | null,
  notice: string | null,
): string {
  if (state.phase === 'judging') return 'Hmm. Let me adjust my glasses…';
  if (error) return "Something went wrong on my end, so that submit wasn't counted. Try again.";
  if (notice) return notice;
  const result = state.lastResult;
  if (result && mode === 'offline') {
    return "I couldn't reach the big judge, so my pocket edition graded these. I'll double-check later, and I never take back a pass.";
  }
  if (!result) {
    return `Fill every square. Each row and column must read as a phrase, and rarer words score more. You get ${MAX_SUBMITS} submits. I'll be judging.`;
  }
  const left = MAX_SUBMITS - state.submitsUsed;
  const anyInvalid = state.entries.some((e) => verdictFor(state, e)?.tier === 'invalid');
  if (anyInvalid) return `Not quite. Fix the red lines. ${left} submit${left === 1 ? '' : 's'} left.`;
  const need = starThresholds(state.level)[0];
  return `All valid, but ${result.total} is short of ${need}. Rarer words, please. ${left} left.`;
}

export function OwlPanel({
  state,
  error,
  mode,
  notice,
  highlighted,
  onEntryPress,
  corrections,
  onCorrect,
}: {
  state: GameState;
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
  /** The line whose "Wrong?" picker is open. */
  const [correcting, setCorrecting] = useState<string | null>(null);

  return (
    <View style={styles.panel}>
      <View style={styles.speechRow}>
        <Text style={styles.owl}>🦉</Text>
        <View style={styles.bubble}>
          <Text style={styles.speech}>{speech(state, error, mode, notice)}</Text>
          {judging && <ActivityIndicator color={colors.wood} style={styles.spinner} />}
        </View>
      </View>

      {state.submitsUsed > 0 && (
        <View style={styles.entries}>
          {state.entries.map((entry) => {
            const words = entryWords(state, entry);
            const verdict = verdictFor(state, entry);
            const base = words?.reduce((sum, w) => sum + wordValue(w), 0) ?? 0;
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
                        { backgroundColor: colors.tier[verdict.tier] },
                        verdict.provisional && styles.badgeProvisional,
                      ]}
                    >
                      {TIER_LABEL[verdict.tier]}
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
                        style={[styles.chip, { borderColor: colors.tier[tier] }]}
                      >
                        <Text style={[styles.chipText, { color: colors.tier[tier] }]}>
                          {TIER_LABEL[tier]}
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
  speechRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  owl: { fontSize: 40 },
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
