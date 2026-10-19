import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { MAX_SUBMITS, TIER_MULTIPLIER } from '../core/config';
import { entryWords, verdictFor, type GameState } from '../core/game';
import { starThresholds, wordValue } from '../core/scoring';
import { displayWord } from '../core/words';
import { colors, TIER_LABEL } from './theme';

function speech(state: GameState, error: string | null): string {
  if (state.phase === 'judging') return 'Hmm. Let me adjust my glasses…';
  if (error) return "I couldn't reach my study, so that submit wasn't counted. Try again.";
  const result = state.lastResult;
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
  highlighted,
  onEntryPress,
}: {
  state: GameState;
  error: string | null;
  highlighted: string | null;
  onEntryPress: (entryId: string) => void;
}) {
  const judging = state.phase === 'judging';

  return (
    <View style={styles.panel}>
      <View style={styles.speechRow}>
        <Text style={styles.owl}>🦉</Text>
        <View style={styles.bubble}>
          <Text style={styles.speech}>{speech(state, error)}</Text>
          {judging && <ActivityIndicator color={colors.wood} style={styles.spinner} />}
        </View>
      </View>

      {state.submitsUsed > 0 && (
        <View style={styles.entries}>
          {state.entries.map((entry) => {
            const words = entryWords(state, entry);
            const verdict = verdictFor(state, entry);
            const base = words?.reduce((sum, w) => sum + wordValue(w), 0) ?? 0;
            return (
              <Pressable
                key={entry.id}
                onPress={() => onEntryPress(entry.id)}
                style={[styles.entry, highlighted === entry.id && styles.entryHighlighted]}
              >
                <View style={styles.entryHead}>
                  <Text style={styles.entryId}>{entry.id}</Text>
                  <Text style={styles.phrase} numberOfLines={1}>
                    {verdict?.reading || words?.map(displayWord).join(' ') || '…'}
                  </Text>
                  {verdict ? (
                    <Text style={[styles.badge, { backgroundColor: colors.tier[verdict.tier] }]}>
                      {TIER_LABEL[verdict.tier]}
                      {verdict.valid ? ` +${Math.round(base * TIER_MULTIPLIER[verdict.tier])}` : ''}
                    </Text>
                  ) : (
                    <Text style={styles.unjudged}>not judged</Text>
                  )}
                </View>
                {verdict && (
                  <Text style={styles.quip}>
                    {verdict.reason ? `${verdict.reason}. ` : ''}
                    <Text style={styles.quipItalic}>{verdict.quip}</Text>
                  </Text>
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
  quip: { marginTop: 4, marginLeft: 36, fontSize: 13, color: colors.inkSoft },
  quipItalic: { fontStyle: 'italic' },
});
