import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { review, reviewQueue, type ReviewItem } from '../../admin';
import type { Tier } from '../../core/types';
import { displayWord } from '../../core/words';
import { AdminButton, adminStyles, Card } from '../../ui/AdminParts';
import { DevGate } from '../../ui/PinGate';
import { colors, TIER_ICON, TIER_LABEL, useTierColors } from '../../ui/theme';

const TIERS: Tier[] = ['invalid', 'ok', 'great', 'poetic'];

/**
 * Players' "Wrong?" corrections, one card per phrase. Approving one as a tier
 * makes it training data for the built-in judge (npm run pull:labels on the
 * PC); rejecting it drops it. Your own labels skip this queue.
 */
export default function ReviewScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.column}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            Review corrections
          </Text>
          <View style={styles.spacer} />
        </View>
        <DevGate>
          <Queue />
        </DevGate>
      </ScrollView>
    </SafeAreaView>
  );
}

function Queue() {
  const tierColors = useTierColors();
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  useEffect(() => {
    let cancelled = false;
    reviewQueue().then(
      (queue) => !cancelled && setItems(queue),
      (e: Error) => !cancelled && setError(e.message),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const settle = async (phrase: string, tier: Tier | null) => {
    try {
      await review(phrase, tier);
      setItems((list) => list && list.filter((item) => item.phrase !== phrase));
      setDone((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (error) return <Text style={adminStyles.error}>{`Couldn't load the queue: ${error}`}</Text>;
  if (!items) return <ActivityIndicator color={colors.wood} />;
  return (
    <View style={styles.stack}>
      <Text style={adminStyles.note}>
        {items.length === 0
          ? `Nothing to review${done ? ` (${done} done)` : ''}. `
          : `${items.length} phrases waiting${done ? `, ${done} done` : ''}. Tap the tier a phrase deserves, or reject it. `}
        Approved labels go to training with npm run pull:labels on your PC.
      </Text>
      {items.map((item) => (
        <Card key={item.phrase}>
          <Text style={styles.phrase} testID="review-phrase">
            {item.phrase.split(' ').map(displayWord).join(' ')}
          </Text>
          <Text style={adminStyles.note}>
            The owl said {item.judged ? `${TIER_ICON[item.judged]} ${TIER_LABEL[item.judged]}` : '(unknown)'} · players say{' '}
            {TIERS.filter((t) => item.votes[t])
              .map((t) => `${TIER_ICON[t]} ${TIER_LABEL[t]} ×${item.votes[t]}`)
              .join(', ')}
          </Text>
          <View style={styles.tiers}>
            {TIERS.map((tier) => (
              <Pressable
                key={tier}
                onPress={() => settle(item.phrase, tier)}
                style={[styles.tier, { backgroundColor: tierColors[tier] }]}
                accessibilityRole="button"
                accessibilityLabel={`Approve as ${TIER_LABEL[tier]}`}
                testID={`review-${tier}`}
              >
                <Text style={styles.tierText}>
                  {TIER_ICON[tier]} {TIER_LABEL[tier]}
                </Text>
              </Pressable>
            ))}
          </View>
          <AdminButton label="Reject" onPress={() => settle(item.phrase, null)} testID="review-reject" />
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  column: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center' },
  back: { width: 70, fontSize: 15, fontWeight: '700', color: colors.wood },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.ink },
  spacer: { width: 70 },
  stack: { gap: 12 },
  phrase: { fontSize: 20, fontWeight: '800', color: colors.ink },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tier: { flexGrow: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  tierText: { fontSize: 14, fontWeight: '800', color: colors.white },
});
