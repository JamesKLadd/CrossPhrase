import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { GameState } from '../core/game';
import { colors } from './theme';

export function ResultOverlay({
  state,
  hasNext,
  onNext,
  onRetry,
  onExit,
  onReview,
}: {
  state: GameState;
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
        <Text style={styles.title}>{won ? 'Level cleared!' : 'Out of submits'}</Text>
        {won && (
          <Text style={styles.stars}>
            {'★'.repeat(result.stars)}
            <Text style={styles.starsEmpty}>{'★'.repeat(3 - result.stars)}</Text>
          </Text>
        )}
        <Text style={styles.score}>
          {result.penalty > 0
            ? `${result.raw} − ${result.penalty} penalty = ${result.total} points`
            : `${result.total} points`}
        </Text>
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
    ...StyleSheet.absoluteFillObject,
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
  stars: { fontSize: 36, color: colors.selected, letterSpacing: 4 },
  starsEmpty: { color: colors.tileEdge },
  score: { fontSize: 16, fontWeight: '600', color: colors.ink },
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
