import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAccount } from '../account';
import { dayKey, dayLabel } from '../data/dailies';
import { LEVEL_IDS, LEVELS } from '../data/levels';
import { currentLevelIndex, useProgress } from '../progress';
import { dailyBoard, levelBoard, scoresEnabled, type BoardRow } from '../scores';
import { colors } from '../ui/theme';

type Tab = 'daily' | 'level';

export default function LeaderboardsScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.column}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            Leaderboards
          </Text>
          <View style={styles.spacer} />
        </View>
        {scoresEnabled ? <Boards /> : <Off />}
      </ScrollView>
    </SafeAreaView>
  );
}

function Off() {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Leaderboards are switched off</Text>
      <Text style={styles.note}>
        They need the free online backend (Supabase). Once it’s set up, as the README describes,
        your daily puzzles and level clears are checked and ranked against your friends’.
      </Text>
    </View>
  );
}

function Boards() {
  const saved = useProgress();
  const [tab, setTab] = useState<Tab>('daily');
  const [day] = useState(() => dayKey());
  const [levelIndex, setLevelIndex] = useState(() =>
    Math.max(0, currentLevelIndex(saved, LEVEL_IDS) - 1),
  );
  const level = LEVELS[levelIndex];
  const key = tab === 'daily' ? `daily:${day}` : `level:${level.id}`;
  const [boards, setBoards] = useState<Record<string, BoardRow[] | null>>({});
  const rows = boards[key];

  useEffect(() => {
    let cancelled = false;
    const load = tab === 'daily' ? dailyBoard(day) : levelBoard(level.id);
    load.then((result) => !cancelled && setBoards((b) => ({ ...b, [key]: result })));
    return () => {
      cancelled = true;
    };
  }, [tab, day, level.id, key]);

  return (
    <View style={styles.boards}>
      <YourName />
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['daily', 'level'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            style={[styles.tab, tab === t && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
              {t === 'daily' ? `Daily · ${dayLabel(day)}` : 'Levels'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'level' && (
        <View style={styles.stepper}>
          <Pressable
            onPress={() => setLevelIndex((i) => Math.max(0, i - 1))}
            hitSlop={12}
            accessibilityLabel="Previous level"
          >
            <Text style={styles.arrow}>‹</Text>
          </Pressable>
          <Text style={styles.levelName} numberOfLines={1}>
            {levelIndex + 1}. {level.name}
          </Text>
          <Pressable
            onPress={() => setLevelIndex((i) => Math.min(LEVELS.length - 1, i + 1))}
            hitSlop={12}
            accessibilityLabel="Next level"
          >
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </View>
      )}

      {rows === undefined ? (
        <ActivityIndicator color={colors.wood} style={styles.loading} />
      ) : rows === null ? (
        <Text style={styles.note}>{"Couldn't reach the leaderboard. Check your connection."}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.note}>
          {tab === 'daily' ? 'Nobody has finished today’s puzzle yet. Be the first!' : 'No clears yet.'}
        </Text>
      ) : (
        rows.map((row, i) => (
          <View key={i} style={[styles.row, row.me && styles.rowMe]} testID={row.me ? 'board-me' : undefined}>
            <Text style={styles.rank}>{row.rank}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {row.name}
              {row.me ? ' (you)' : ''}
            </Text>
            <Text style={styles.stars}>{'★'.repeat(row.stars)}</Text>
            <Text style={styles.score}>{row.score}</Text>
          </View>
        ))
      )}
      <Text style={styles.footnote}>
        Scores are checked on the server: it replays every move and re-judges each line with the
        built-in judge, so a PC-judged level can score differently here.
      </Text>
    </View>
  );
}

/** Your name on the boards: your account's username, or Anonymous owl without one. */
function YourName() {
  const { userId, username } = useAccount();
  if (userId && username) {
    return (
      <View style={styles.card}>
        <Text style={styles.note} testID="board-name">
          You’re on the boards as <Text style={styles.strong}>{username}</Text>.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <Text style={styles.note} testID="board-name">
        You’re on the boards as <Text style={styles.strong}>Anonymous owl</Text>. Create an account to use your own
        name, and to keep your progress on any device.
      </Text>
      <Pressable onPress={() => router.push('/account')} style={styles.save} accessibilityRole="button" testID="board-account">
        <Text style={styles.saveText}>Create an account</Text>
      </Pressable>
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
  boards: { gap: 10 },
  card: {
    gap: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.tile,
    borderWidth: 1.5,
    borderColor: colors.tileEdge,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  note: { fontSize: 14, lineHeight: 20, color: colors.inkSoft, textAlign: 'center' },
  strong: { fontWeight: '800', color: colors.ink },
  save: { alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: colors.wood },
  saveText: { fontSize: 15, fontWeight: '700', color: colors.white },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.wood,
  },
  tabOn: { backgroundColor: colors.wood },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.wood },
  tabTextOn: { color: colors.white },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  arrow: { fontSize: 28, fontWeight: '800', color: colors.wood, paddingHorizontal: 8 },
  levelName: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.ink },
  loading: { marginTop: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.cell,
    borderWidth: 1,
    borderColor: colors.tileEdge,
  },
  rowMe: { borderColor: colors.selected, borderWidth: 2 },
  rank: { width: 28, fontSize: 16, fontWeight: '900', color: colors.wood, textAlign: 'center' },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  stars: { fontSize: 13, color: colors.star },
  score: { width: 44, fontSize: 16, fontWeight: '800', color: colors.ink, textAlign: 'right' },
  footnote: { fontSize: 12, lineHeight: 17, color: colors.inkSoft, textAlign: 'center' },
});
