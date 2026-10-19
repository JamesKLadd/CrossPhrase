import { Link } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LEVELS } from '../data/levels';
import { THEMES } from '../data/themes';
import { judgeService } from '../judge';
import { colors } from '../ui/theme';

export default function LevelSelect() {
  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={LEVELS}
        keyExtractor={(level) => level.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.owl}>🦉</Text>
            <Text style={styles.title}>CrossPhrase</Text>
            <Text style={styles.subtitle}>A crossword where every square is a word.</Text>
            {!judgeService.hasRemote && (
              <Text style={styles.devNote}>
                Dev mode: no backend configured, so a lenient local judge grades phrases.
              </Text>
            )}
          </View>
        }
        renderItem={({ item: level, index }) => {
          const theme = THEMES[level.theme];
          return (
            <Link href={`/play/${level.id}`} asChild>
              <Pressable style={styles.card}>
                <Text style={styles.number}>{index + 1}</Text>
                <View style={styles.cardBody}>
                  <Text style={styles.levelName}>{level.name}</Text>
                  <Text style={styles.levelMeta}>
                    {theme.emoji} {theme.name} · {level.layout[0].length}×{level.layout.length}
                  </Text>
                </View>
                <Text style={styles.play}>Play ›</Text>
              </Pressable>
            </Link>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  list: { padding: 16, gap: 10, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { alignItems: 'center', gap: 4, marginBottom: 12 },
  owl: { fontSize: 64 },
  title: { fontSize: 34, fontWeight: '900', color: colors.ink, letterSpacing: 0.5 },
  subtitle: { fontSize: 15, color: colors.inkSoft },
  devNote: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    fontSize: 12,
    color: colors.inkSoft,
    backgroundColor: colors.paperDeep,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.tile,
    borderWidth: 1.5,
    borderColor: colors.tileEdge,
    borderBottomWidth: 4,
  },
  number: { width: 28, fontSize: 20, fontWeight: '900', color: colors.wood, textAlign: 'center' },
  cardBody: { flex: 1 },
  levelName: { fontSize: 17, fontWeight: '700', color: colors.ink },
  levelMeta: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  play: { fontSize: 15, fontWeight: '700', color: colors.wood },
});
