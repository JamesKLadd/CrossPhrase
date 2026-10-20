import { Pressable, StyleSheet, Text, View } from 'react-native';

import { track } from '../analytics';
import { formatWait } from '../core/economy';
import { useLives, useWallet, wallet } from '../economy';
import { useRemoteConfig } from '../remote';
import { playSound } from './feedback';
import { colors } from './theme';

/** Hearts (with the wait for the next one), feathers, and a refill when hearts are low. */
export function WalletBar() {
  const lives = useLives();
  const { feathers } = useWallet();
  const { economy } = useRemoteConfig();
  const cost = economy.lives.refillCost;
  const canRefill = !lives.unlimited && lives.lives < lives.max;

  return (
    <View style={styles.bar}>
      {!lives.unlimited && (
        <Text
          style={styles.item}
          testID="wallet-hearts"
          accessibilityLabel={`${lives.lives} of ${lives.max} hearts${
            lives.nextIn !== null ? `, next one in ${formatWait(lives.nextIn)}` : ''
          }`}
        >
          ❤️ {lives.lives}/{lives.max}
          {lives.nextIn !== null && <Text style={styles.wait}>{`  +1 in ${formatWait(lives.nextIn)}`}</Text>}
        </Text>
      )}
      <Text style={styles.item} testID="wallet-feathers" accessibilityLabel={`${feathers} feathers`}>
        🪶 {feathers}
      </Text>
      {canRefill && (
        <Pressable
          onPress={() => {
            if (!wallet.refill()) return;
            playSound('star3');
            track('hearts_refill', { cost });
          }}
          disabled={feathers < cost}
          accessibilityRole="button"
          accessibilityLabel={`Refill hearts for ${cost} feathers`}
          style={[styles.refill, feathers < cost && styles.refillOff]}
          testID="wallet-refill"
        >
          <Text style={styles.refillText}>Refill · {cost} 🪶</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 4 },
  item: { fontSize: 15, fontWeight: '800', color: colors.ink },
  wait: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  refill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: colors.wood },
  refillOff: { opacity: 0.4 },
  refillText: { fontSize: 13, fontWeight: '700', color: colors.white },
});
