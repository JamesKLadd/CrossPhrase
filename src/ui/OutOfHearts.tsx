import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { track } from '../analytics';
import { formatWait } from '../core/economy';
import { useLives, useWallet, wallet } from '../economy';
import { useRemoteConfig } from '../remote';
import { useReduceMotion } from '../settings';
import { playSound } from './feedback';
import { Owl } from './Owl';
import { colors } from './theme';

/**
 * Shown instead of a level when the player has no hearts left: wait for the
 * next one, refill with feathers, or play the daily puzzle or zen mode, which
 * never cost hearts.
 */
export function OutOfHearts({ onPlay }: { onPlay: () => void }) {
  const lives = useLives();
  const { feathers } = useWallet();
  const { economy } = useRemoteConfig();
  const still = useReduceMotion();
  const cost = economy.lives.refillCost;

  useEffect(() => {
    track('out_of_hearts', {});
  }, []);

  const ready = lives.lives > 0;
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.column}>
        <Owl size={110} mood={ready ? 'pleased' : 'idle'} still={still} />
        <Text style={styles.title}>{ready ? 'A heart is back!' : 'Out of hearts'}</Text>
        <Text style={styles.note} testID="hearts-wait">
          {ready
            ? `You have ${lives.lives} ${lives.lives === 1 ? 'heart' : 'hearts'}.`
            : `Losing a level costs a heart. The next one is back in ${formatWait(lives.nextIn ?? 0)}.`}
        </Text>
        {ready ? (
          <Button label="Play" primary onPress={onPlay} testID="hearts-play" />
        ) : (
          <Button
            label={`Refill hearts · ${cost} 🪶 (you have ${feathers})`}
            primary
            disabled={feathers < cost}
            onPress={() => {
              if (!wallet.refill()) return;
              playSound('star3');
              track('hearts_refill', { cost });
            }}
            testID="hearts-refill"
          />
        )}
        <Text style={styles.note}>The daily puzzle and zen mode never cost hearts.</Text>
        <Button label="📅 Daily puzzle" onPress={() => router.replace('/daily')} />
        <Button label="🧘 Zen" onPress={() => router.replace('/zen')} />
        <Button label="‹ Levels" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
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
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
      style={[styles.button, primary && styles.buttonPrimary, disabled && styles.buttonOff]}
    >
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  column: { width: '100%', maxWidth: 420, alignSelf: 'center', alignItems: 'center', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  note: { fontSize: 15, lineHeight: 21, color: colors.inkSoft, textAlign: 'center' },
  button: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.wood,
  },
  buttonPrimary: { backgroundColor: colors.wood },
  buttonOff: { opacity: 0.4 },
  buttonText: { fontSize: 16, fontWeight: '700', color: colors.wood },
  buttonTextPrimary: { color: colors.white },
});
