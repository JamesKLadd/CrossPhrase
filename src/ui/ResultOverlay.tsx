import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { GameState } from '../core/game';
import { describeObjective } from '../core/objectives';
import { colors } from './theme';

export function ResultOverlay({
  state,
  levelNumber,
  newBest,
  hasNext,
  onNext,
  onRetry,
  onExit,
  onReview,
}: {
  state: GameState;
  levelNumber: number;
  /** This clear beat the player's earlier best on the level. */
  newBest: boolean;
  hasNext: boolean;
  onNext: () => void;
  onRetry: () => void;
  onExit: () => void;
  /** Hides this card so the player can read (and correct) the owl's verdicts. */
  onReview: () => void;
}) {
  const result = state.lastResult;
  if (!result || (state.phase !== 'won' && state.phase !== 'lost')) return null;
  const won = state.phase === 'won';

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.owl}>🦉</Text>
        <Text style={styles.title}>{won ? `Level ${levelNumber} cleared!` : 'Out of submits'}</Text>
        {won && (
          <Text style={styles.stars} testID="result-stars">
            {'★'.repeat(result.stars)}
            <Text style={styles.starsEmpty}>{'★'.repeat(3 - result.stars)}</Text>
          </Text>
        )}
        {won && newBest && <Text style={styles.best}>New best!</Text>}
        <Text style={styles.score}>{result.total} points</Text>
        {(result.bonus > 0 || result.penalty > 0) && (
          <Text style={styles.breakdown}>
            {result.raw} from lines
            {result.bonus > 0 ? ` + ${result.bonus} bonus` : ''}
            {result.penalty > 0 ? ` − ${result.penalty} penalty` : ''}
          </Text>
        )}
        {result.objectives.length > 0 && (
          <View style={styles.objectives}>
            {result.objectives.map((o, i) => (
              <Text key={i} style={[styles.objective, o.met && styles.objectiveMet]}>
                {o.met ? '✓' : '✗'} {describeObjective(o.objective)} {o.met ? `+${o.objective.points}` : ''}
              </Text>
            ))}
          </View>
        )}
        <Text style={styles.remark}>
          {won
            ? result.stars === 3
              ? 'Exquisite. I may frame this one.'
              : 'Acceptable work. I expect more next time.'
            : 'The dictionary weeps. Shall we try again?'}
        </Text>
        <View style={styles.buttons}>
          {won && hasNext && <Button label="Next level" primary onPress={onNext} />}
          <Button label={won ? 'Replay' : 'Try again'} primary={!won} onPress={onRetry} />
          <Button label="See the owl's verdicts" onPress={onReview} />
          <Button label="Levels" onPress={onExit} />
        </View>
      </View>
    </View>
  );
}

function Button({ label, primary, onPress }: { label: string; primary?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.button, primary && styles.buttonPrimary]}>
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(47, 42, 36, 0.55)',
  },
  card: {
    alignSelf: 'stretch',
    maxWidth: 380,
    alignItems: 'center',
    gap: 8,
    padding: 24,
    borderRadius: 20,
    backgroundColor: colors.paper,
  },
  owl: { fontSize: 56 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  stars: { fontSize: 36, color: colors.star, letterSpacing: 4 },
  starsEmpty: { color: colors.starEmpty },
  best: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
    fontSize: 13,
    fontWeight: '800',
    color: colors.white,
    backgroundColor: colors.tier.great,
  },
  score: { fontSize: 18, fontWeight: '800', color: colors.ink },
  breakdown: { fontSize: 13, color: colors.inkSoft },
  objectives: { alignSelf: 'stretch', gap: 2, marginTop: 4 },
  objective: { fontSize: 13, color: colors.inkSoft, textAlign: 'center' },
  objectiveMet: { color: colors.tier.great, fontWeight: '700' },
  remark: { fontStyle: 'italic', color: colors.inkSoft, textAlign: 'center' },
  buttons: { marginTop: 8, gap: 8, alignSelf: 'stretch' },
  button: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.wood,
  },
  buttonPrimary: { backgroundColor: colors.wood },
  buttonText: { fontSize: 16, fontWeight: '700', color: colors.wood },
  buttonTextPrimary: { color: colors.white },
});
