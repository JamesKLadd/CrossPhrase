import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import type { GameState } from '../core/game';
import { describeObjective } from '../core/objectives';
import { owlLine } from '../core/quips';
import { playSound } from './feedback';
import { Owl } from './Owl';
import { colors } from './theme';

const STAR_DELAY_MS = 450;
const STAR_GAP_MS = 380;

function Star({ index, earned, still }: { index: number; earned: boolean; still: boolean }) {
  const scale = useSharedValue(earned && !still ? 0 : 1);
  useEffect(() => {
    if (!earned || still) return;
    scale.set(withDelay(STAR_DELAY_MS + index * STAR_GAP_MS, withSpring(1, { damping: 7, stiffness: 160 })));
  }, [earned, still, index, scale]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }, { rotate: `${(1 - scale.get()) * -90}deg` }],
  }));
  return (
    <View>
      <Text style={[styles.star, styles.starEmpty]}>★</Text>
      {earned && <Animated.Text style={[styles.star, styles.starEarned, style]}>★</Animated.Text>}
    </View>
  );
}

export interface ResultAction {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}

export type Rating = 'easy' | 'right' | 'hard';

const RATINGS: { rating: Rating; label: string }[] = [
  { rating: 'easy', label: '😴 Too easy' },
  { rating: 'right', label: '🙂 Just right' },
  { rating: 'hard', label: '😤 Too hard' },
];

export function ResultOverlay({
  state,
  heading,
  newBest,
  note,
  still,
  actions,
  onReview,
  onRate,
}: {
  state: GameState;
  heading: string;
  /** This clear beat the player's earlier best. */
  newBest: boolean;
  /** An extra line under the score, e.g. a streak. */
  note: string | null;
  /** Reduced motion: no pops or entrance. */
  still: boolean;
  actions: ResultAction[];
  /** Hides this card so the player can read (and correct) the owl's verdicts. */
  onReview: () => void;
  /** Asks how the level felt (for playtesting), when play stats are on. */
  onRate?: (rating: Rating) => void;
}) {
  const [rated, setRated] = useState(false);
  const result = state.lastResult;
  const won = state.phase === 'won';
  const zen = state.level.zen === true;
  const stars = won ? (result?.stars ?? 0) : 0;
  const finished = result !== null && (state.phase === 'won' || state.phase === 'lost');

  // Each star chimes as it lands.
  useEffect(() => {
    if (!finished) return;
    const timers = Array.from({ length: stars }, (_, i) =>
      setTimeout(
        () => playSound(`star${(i + 1) as 1 | 2 | 3}`),
        still ? i * 150 : STAR_DELAY_MS + i * STAR_GAP_MS + 120,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [finished, stars, still]);

  const entrance = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (finished && !still) entrance.set(withSpring(1, { damping: 13, stiffness: 140 }));
  }, [finished, still, entrance]);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, entrance.get() * 1.5),
    transform: [{ scale: 0.85 + 0.15 * entrance.get() }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, entrance.get() * 2) }));

  if (!finished || !result) return null;
  const seed = `${state.level.id}:${result.total}`;

  return (
    <Animated.View style={[styles.backdrop, backdropStyle]}>
      <Animated.View style={[styles.card, cardStyle]}>
        <Owl
          size={96}
          mood={won ? (stars === 3 ? 'dazzled' : 'delighted') : 'disappointed'}
          still={still}
        />
        <Text style={styles.title}>{heading}</Text>
        {won && !zen && (
          <View
            style={styles.stars}
            testID="result-stars"
            accessible
            accessibilityLabel={`${stars} of 3 stars`}
          >
            {[0, 1, 2].map((i) => (
              <Star key={i} index={i} earned={i < stars} still={still} />
            ))}
          </View>
        )}
        {won && newBest && <Text style={styles.best}>New best!</Text>}
        <Text style={styles.score}>{result.total} points</Text>
        {note && <Text style={styles.note}>{note}</Text>}
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
          {zen ? owlLine('zenWin', seed) : won ? owlLine(`win${stars as 1 | 2 | 3}`, seed) : owlLine('lose', seed)}
        </Text>
        {onRate &&
          (rated ? (
            <Text style={styles.thanks}>Thanks! That helps tune the levels.</Text>
          ) : (
            <View style={styles.ratings} accessibilityLabel="How did that feel?">
              {RATINGS.map(({ rating, label }) => (
                <Pressable
                  key={rating}
                  onPress={() => {
                    setRated(true);
                    onRate(rating);
                  }}
                  accessibilityRole="button"
                  style={styles.rating}
                  testID={`rate-${rating}`}
                >
                  <Text style={styles.ratingText} maxFontSizeMultiplier={1.3}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
        <View style={styles.buttons}>
          {actions.map((action, i) => (
            <Button
              key={i}
              label={action.label}
              primary={action.primary}
              disabled={action.disabled}
              onPress={action.onPress}
              testID={action.testID}
            />
          ))}
          <Button label="See the owl's verdicts" onPress={onReview} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function Button({
  label,
  primary,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        playSound('tap');
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
      style={[styles.button, primary && styles.buttonPrimary, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
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
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  stars: { flexDirection: 'row', gap: 6 },
  star: { fontSize: 40, lineHeight: 46 },
  starEmpty: { color: colors.starEmpty },
  starEarned: { position: 'absolute', color: colors.star },
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
  note: { fontSize: 14, fontWeight: '700', color: colors.wood, textAlign: 'center' },
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
  buttonDisabled: { opacity: 0.45 },
  ratings: { flexDirection: 'row', gap: 6, alignSelf: 'stretch', marginTop: 4 },
  rating: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.paperDeep,
  },
  ratingText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  thanks: { fontSize: 13, color: colors.inkSoft, marginTop: 4 },
  buttonText: { fontSize: 16, fontWeight: '700', color: colors.wood },
  buttonTextPrimary: { color: colors.white },
});
