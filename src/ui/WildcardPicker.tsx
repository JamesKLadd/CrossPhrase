import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { tileValue } from '../core/scoring';
import { allWords, displayWord, poolWords, wordInfo } from '../core/words';
import { colors } from './theme';

/** How many matches to show at once; typing narrows the rest down. */
const SHOWN = 60;

/**
 * Picks the word a wildcard becomes: any dictionary word. Theme words come
 * first, then the rest alphabetically. Each shows what it would score.
 */
export function WildcardPicker({
  theme,
  visible,
  onPick,
  onCancel,
}: {
  theme: string;
  visible: boolean;
  onPick: (word: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const words = useMemo(() => {
    const themed = new Set(poolWords(theme));
    return allWords().sort(
      (a, b) => Number(themed.has(b)) - Number(themed.has(a)) || (a < b ? -1 : 1),
    );
  }, [theme]);
  const q = query.trim().toLowerCase();
  const matches = (q ? words.filter((w) => w.startsWith(q)) : words).slice(0, SHOWN);

  const close = (word?: string) => {
    setQuery('');
    if (word) onPick(word);
    else onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => close()}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>★ Wildcard</Text>
          <Text style={styles.help}>
            Pick any word in my dictionary. It scores half its usual value.
          </Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Type to search…"
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.search}
            testID="wildcard-search"
          />
          <ScrollView style={styles.list} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {matches.length === 0 ? (
              <Text style={styles.help}>{`No words start with “${q}”.`}</Text>
            ) : (
              matches.map((word) => (
                <Pressable key={word} onPress={() => close(word)} style={styles.chip} testID={`wild-${word}`}>
                  <Text style={styles.chipWord}>{displayWord(word)}</Text>
                  <Text style={styles.chipMeta}>
                    {wordInfo(word).pos[0]} · {tileValue({ word, wildcard: true })}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
          <Pressable onPress={() => close()} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(47, 42, 36, 0.55)',
  },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    gap: 10,
    padding: 18,
    borderRadius: 20,
    backgroundColor: colors.paper,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  help: { fontSize: 13, color: colors.inkSoft, textAlign: 'center' },
  search: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.tileEdge,
    backgroundColor: colors.white,
    fontSize: 16,
    color: colors.ink,
  },
  list: { flexGrow: 0, flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.tile,
    borderWidth: 1.5,
    borderColor: colors.tileEdge,
  },
  chipWord: { fontSize: 15, fontWeight: '700', color: colors.ink },
  chipMeta: { fontSize: 10, color: colors.inkSoft },
  cancel: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.wood,
  },
  cancelText: { fontSize: 15, fontWeight: '700', color: colors.wood },
});
