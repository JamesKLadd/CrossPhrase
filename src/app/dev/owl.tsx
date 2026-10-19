import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Owl, type OwlMood } from '../../ui/Owl';
import { colors } from '../../ui/theme';

const MOODS: OwlMood[] = ['idle', 'thinking', 'pleased', 'delighted', 'dazzled', 'disappointed'];

/** Every mood of the owl side by side; tap one to replay its reaction. */
export default function OwlGallery() {
  const [reactions, setReactions] = useState<Record<string, number>>({});
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>The owl</Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.grid}>
        {MOODS.map((mood) => (
          <Pressable
            key={mood}
            testID={`owl-${mood}`}
            style={styles.cell}
            onPress={() => setReactions((r) => ({ ...r, [mood]: (r[mood] ?? 0) + 1 }))}
          >
            <Owl size={120} mood={mood} reaction={reactions[mood] ?? 0} />
            <Text style={styles.label}>{mood}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  back: { width: 70, fontSize: 15, fontWeight: '700', color: colors.wood },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.ink },
  spacer: { width: 70 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, padding: 16 },
  cell: { alignItems: 'center', gap: 4, padding: 8, borderRadius: 16, backgroundColor: colors.paperDeep },
  label: { fontSize: 13, fontWeight: '700', color: colors.inkSoft },
});
