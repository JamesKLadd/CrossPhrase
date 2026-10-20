import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { BoosterKind, EconomyConfig } from '../core/economy';
import { displayWord } from '../core/words';
import { colors } from './theme';

interface Option {
  kind: BoosterKind;
  title: string;
  help: string;
  /** Why it can't be used right now, if it can't. */
  blocked?: string;
}

/** The boosters a player can buy with feathers during a level. */
export function BoosterSheet({
  visible,
  economy,
  feathers,
  selectedWord,
  swapsLeft,
  onBuy,
  onClose,
}: {
  visible: boolean;
  economy: EconomyConfig;
  feathers: number;
  /** The hand word selected right now, for the wildcard booster. */
  selectedWord: string | null;
  swapsLeft: number;
  onBuy: (kind: BoosterKind) => void;
  onClose: () => void;
}) {
  const { swaps } = economy.boosters;
  const options: Option[] = [
    {
      kind: 'hint',
      title: '💡 Hint',
      help: 'The owl fills one line from your hand.',
    },
    {
      kind: 'swaps',
      title: `🔁 +${swaps.count} swaps`,
      help: `You have ${swapsLeft} left.`,
    },
    {
      kind: 'wildcard',
      title: '★ Wildcard',
      help: selectedWord
        ? `Turns “${displayWord(selectedWord)}” into any word you like.`
        : 'Turns a word in your hand into any word you like.',
      blocked: selectedWord ? undefined : 'Select a word in your hand first',
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close boosters">
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Boosters</Text>
          <Text style={styles.balance} testID="booster-balance">
            You have 🪶 {feathers}
          </Text>
          {options.map(({ kind, title, help, blocked }) => {
            const cost = economy.boosters[kind].cost;
            const short = feathers < cost;
            const disabled = short || blocked !== undefined;
            return (
              <Pressable
                key={kind}
                onPress={() => onBuy(kind)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                style={[styles.option, disabled && styles.optionOff]}
                testID={`booster-${kind}`}
              >
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{title}</Text>
                  <Text style={styles.optionHelp}>{blocked ?? (short ? `You need ${cost - feathers} more feathers.` : help)}</Text>
                </View>
                <Text style={styles.cost}>{cost} 🪶</Text>
              </Pressable>
            );
          })}
          <Text style={styles.note}>
            Feathers come from new stars, daily puzzles and zen boards. Boosted clears don’t go on the
            leaderboards.
          </Text>
          <Pressable onPress={onClose} style={styles.close} accessibilityRole="button">
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(47, 42, 36, 0.55)',
  },
  card: { alignSelf: 'stretch', maxWidth: 380, gap: 10, padding: 20, borderRadius: 20, backgroundColor: colors.paper },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  balance: { fontSize: 15, fontWeight: '700', color: colors.wood, textAlign: 'center' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.tile,
    borderWidth: 1.5,
    borderColor: colors.tileEdge,
    borderBottomWidth: 4,
  },
  optionOff: { opacity: 0.5 },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  optionHelp: { fontSize: 13, color: colors.inkSoft },
  cost: { fontSize: 15, fontWeight: '800', color: colors.wood },
  note: { fontSize: 12, lineHeight: 17, color: colors.inkSoft, textAlign: 'center' },
  close: { alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: colors.wood },
  closeText: { fontSize: 15, fontWeight: '700', color: colors.wood },
});
