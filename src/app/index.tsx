import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { LevelDef } from '../core/types';
import { LEVEL_IDS, LEVELS } from '../data/levels';
import { THEMES } from '../data/themes';
import { TUTORIAL } from '../data/tutorial';
import { addDays, dailyLevel, dayKey } from '../data/dailies';
import {
  currentLevelIndex,
  dailyStreak,
  isUnlocked,
  totalStars,
  useProgress,
  type ProgressSnapshot,
} from '../progress';
import { flushScores } from '../scores';
import { useReduceMotion } from '../settings';
import { devToolsEnabled } from '../ui/devAccess';
import { haptic, playSound } from '../ui/feedback';
import { Owl } from '../ui/Owl';
import { colors } from '../ui/theme';
import { useJudgeStatus } from '../ui/useJudgeStatus';
import { InstallTip } from '../ui/InstallTip';
import { WalletBar } from '../ui/WalletBar';

const ROW_HEIGHT = 100;
const NODE = 60;
/** Where a node's centre sits within its row. */
const NODE_Y = 60;
/** Where the dots between two levels sit, as fractions of the way from one node to the next. */
const DOTS = [0.53, 0.61, 0.69];

type Row =
  | { kind: 'chapter'; key: string; title: string; subtitle: string; tint: string }
  | { kind: 'level'; key: string; level: LevelDef; index: number; joined: boolean };

/** The map's rows: a header for each chapter (the tutorial, then each theme run), then its levels. */
function mapRows(): Row[] {
  const rows: Row[] = [];
  LEVELS.forEach((level, index) => {
    const tutorial = index < TUTORIAL.length;
    const newChapter =
      index === 0 || index === TUTORIAL.length || (!tutorial && level.theme !== LEVELS[index - 1].theme);
    if (newChapter) {
      let end = index;
      while (end + 1 < LEVELS.length && (tutorial ? end + 1 < TUTORIAL.length : LEVELS[end + 1].theme === level.theme)) {
        end++;
      }
      const theme = THEMES[level.theme];
      rows.push({
        kind: 'chapter',
        key: `chapter-${index}`,
        title: tutorial ? '🦉 Owl School' : `${theme.emoji} ${theme.name}`,
        subtitle: `Levels ${index + 1}–${end + 1}`,
        tint: tutorial ? colors.paperDeep : theme.tint,
      });
    }
    rows.push({ kind: 'level', key: level.id, level, index, joined: !newChapter });
  });
  return rows;
}

const ROWS = mapRows();

/** The winding path: each level's horizontal offset from the centre line. */
const offsetFor = (index: number, amplitude: number) => Math.sin(index * 0.9) * amplitude;

export default function LevelMap() {
  const judgeStatus = useJudgeStatus();
  const saved = useProgress();
  const { width, height } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const scrolled = useRef(false);
  const current = currentLevelIndex(saved, LEVEL_IDS);
  const amplitude = Math.min(Math.min(width, 520) * 0.26, 120);
  const still = useReduceMotion();
  const [hoots, setHoots] = useState(0);

  // Send any leaderboard scores that couldn't go when they were made.
  useEffect(() => {
    flushScores().catch(() => {});
  }, []);

  // Start with the next level to play in view. For the first few levels the
  // header (and today's daily puzzle) matter more, so the map starts at the top.
  const onCurrentLayout = (e: LayoutChangeEvent) => {
    if (scrolled.current) return;
    scrolled.current = true;
    const { y } = e.nativeEvent.layout;
    if (current < 3 || y < height * 0.6) return;
    requestAnimationFrame(() => scroll.current?.scrollTo({ y: y - height / 3, animated: false }));
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView ref={scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.push('/settings')}
            style={styles.settings}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            testID="settings-button"
          >
            <Text style={styles.settingsIcon}>⚙️</Text>
          </Pressable>
          {/* Tap the owl to say hello; long-press for the PIN-locked developer tools. */}
          <Pressable
            onPress={() => {
              playSound('hoot');
              haptic('tap');
              setHoots((h) => h + 1);
            }}
            onLongPress={() => devToolsEnabled && router.push('/dev')}
            delayLongPress={800}
            accessibilityLabel="The owl"
          >
            <Owl size={110} mood={hoots % 4 === 3 ? 'dazzled' : hoots > 0 ? 'pleased' : 'idle'} reaction={hoots} still={still} />
          </Pressable>
          <Text style={styles.title}>CrossPhrase</Text>
          <Text style={styles.subtitle}>A crossword where every square is a word.</Text>
          <Text style={styles.totalStars} testID="total-stars">
            ★ {totalStars(saved)} of {LEVELS.length * 3}
          </Text>
          <WalletBar />
          {/* Which judge is grading: for development, not for players on the website. */}
          {(__DEV__ || devToolsEnabled) && <Text style={styles.devNote}>{judgeStatus}</Text>}
          <InstallTip />
          <Modes saved={saved} />
        </View>

        {ROWS.map((row) =>
          row.kind === 'chapter' ? (
            <View key={row.key} style={[styles.chapter, { backgroundColor: row.tint }]}>
              <Text style={styles.chapterTitle}>{row.title}</Text>
              <Text style={styles.chapterSubtitle}>{row.subtitle}</Text>
            </View>
          ) : (
            <LevelRow
              key={row.key}
              row={row}
              saved={saved}
              current={row.index === current}
              amplitude={amplitude}
              still={still}
              onLayout={row.index === current ? onCurrentLayout : undefined}
            />
          ),
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Today's daily puzzle, zen mode and the leaderboards. */
function Modes({ saved }: { saved: ProgressSnapshot }) {
  const [today] = useState(() => dayKey());
  const record = saved.daily[today];
  const streak = dailyStreak(saved, today, (day) => addDays(day, -1));
  const daily = !dailyLevel(today)
    ? 'No puzzle today: update the game'
    : record?.finished
      ? record.won
        ? `Solved ${'★'.repeat(record.stars)}${'☆'.repeat(3 - record.stars)} · see you tomorrow`
        : 'Out of submits · see you tomorrow'
      : record
        ? 'Pick up where you left off'
        : 'The same board for everyone · one try';
  return (
    <View style={styles.modes}>
      <Pressable
        style={[styles.mode, styles.modeDaily]}
        onPress={() => router.push('/daily')}
        accessibilityRole="button"
        testID="mode-daily"
      >
        <Text style={styles.modeTitle}>📅 Daily puzzle{streak > 1 ? `  🔥 ${streak}` : ''}</Text>
        <Text style={styles.modeNote}>{daily}</Text>
      </Pressable>
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.mode, styles.modeHalf]}
          onPress={() => router.push('/zen')}
          accessibilityRole="button"
          testID="mode-zen"
        >
          <Text style={styles.modeTitle}>🧘 Zen</Text>
          <Text style={styles.modeNote}>
            {saved.zen.boards > 0 ? `${saved.zen.boards} boards so far` : 'Endless, no limits'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.mode, styles.modeHalf]}
          onPress={() => router.push('/leaderboards')}
          accessibilityRole="button"
          testID="mode-leaderboards"
        >
          <Text style={styles.modeTitle}>🏆 Leaderboards</Text>
          <Text style={styles.modeNote}>Daily and levels</Text>
        </Pressable>
      </View>
    </View>
  );
}

function LevelRow({
  row,
  saved,
  current,
  amplitude,
  still,
  onLayout,
}: {
  row: Extract<Row, { kind: 'level' }>;
  saved: ProgressSnapshot;
  current: boolean;
  amplitude: number;
  still: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { level, index } = row;
  const x = offsetFor(index, amplitude);
  const prevX = offsetFor(index - 1, amplitude);
  const stars = saved.levels[level.id]?.stars ?? 0;
  const unlocked = isUnlocked(saved, LEVEL_IDS, index);

  return (
    <View style={styles.row} onLayout={onLayout}>
      {/* Dots leading up from the previous level. */}
      {row.joined &&
        DOTS.map((t) => (
          <View
            key={t}
            style={[
              styles.dot,
              { left: '50%', top: NODE_Y - ROW_HEIGHT * (1 - t) - 3, marginLeft: prevX + (x - prevX) * t - 3 },
              unlocked && styles.dotDone,
            ]}
          />
        ))}
      <View style={[styles.nodeColumn, { marginLeft: x * 2 }]}>
        <Pressable
          testID={`level-node-${level.id}`}
          disabled={!unlocked}
          onPress={() => {
            playSound('tap');
            router.push(`/play/${level.id}`);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Level ${index + 1}, ${level.name}, ${
            unlocked ? `${stars} of 3 stars` : 'locked'
          }`}
          accessibilityState={{ disabled: !unlocked }}
          style={[
            styles.node,
            stars > 0 && styles.nodeCleared,
            current && styles.nodeCurrent,
            !unlocked && styles.nodeLocked,
          ]}
        >
          <Text
            style={[styles.nodeNumber, stars > 0 && styles.nodeNumberCleared]}
            allowFontScaling={false}
          >
            {unlocked ? index + 1 : '🔒'}
          </Text>
        </Pressable>
        <Text style={styles.nodeStars} allowFontScaling={false}>
          <Text style={styles.starOn}>{'★'.repeat(stars)}</Text>
          {'★'.repeat(3 - stars)}
        </Text>
      </View>
      {current && (
        // The owl waits by the next level to play.
        <View pointerEvents="none" style={[styles.marker, { marginLeft: x + NODE / 2 - 6 }]}>
          <Owl size={34} still={still} />
        </View>
      )}
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={1.3}
        style={[
          styles.levelName,
          x > 0 ? { right: '50%', marginRight: NODE / 2 + 10 - x, textAlign: 'right' } : { left: '50%', marginLeft: NODE / 2 + 10 + x },
          !unlocked && styles.levelNameLocked,
        ]}
      >
        {level.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 48, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { alignItems: 'center', gap: 4, marginBottom: 8 },
  settings: { position: 'absolute', right: 0, top: 0, padding: 4 },
  settingsIcon: { fontSize: 24 },
  title: { fontSize: 34, fontWeight: '900', color: colors.ink, letterSpacing: 0.5 },
  subtitle: { fontSize: 15, color: colors.inkSoft },
  totalStars: { marginTop: 4, fontSize: 16, fontWeight: '800', color: colors.wood },
  devNote: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    fontSize: 12,
    color: colors.inkSoft,
    backgroundColor: colors.paperDeep,
    textAlign: 'center',
  },
  modes: { alignSelf: 'stretch', gap: 8, marginTop: 12 },
  modeRow: { flexDirection: 'row', gap: 8 },
  mode: {
    gap: 2,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.tile,
    borderWidth: 1.5,
    borderColor: colors.tileEdge,
    borderBottomWidth: 4,
  },
  modeHalf: { flex: 1 },
  modeDaily: { borderColor: colors.selected },
  modeTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  modeNote: { fontSize: 13, color: colors.inkSoft },
  chapter: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 4,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.paperDeep,
  },
  chapterTitle: { fontSize: 18, fontWeight: '900', color: colors.ink },
  chapterSubtitle: { fontSize: 12, color: colors.inkSoft },
  row: { height: ROW_HEIGHT },
  dot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.tileEdge,
  },
  dotDone: { backgroundColor: colors.wood },
  nodeColumn: {
    position: 'absolute',
    top: NODE_Y - NODE / 2,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tile,
    borderWidth: 2,
    borderColor: colors.tileEdge,
    borderBottomWidth: 5,
  },
  nodeCleared: { backgroundColor: colors.wood, borderColor: colors.blocked },
  nodeCurrent: { borderColor: colors.selected, borderWidth: 4, borderBottomWidth: 6 },
  nodeLocked: { backgroundColor: colors.paperDeep, borderColor: colors.tileEdge },
  nodeNumber: { fontSize: 20, fontWeight: '900', color: colors.wood },
  nodeNumberCleared: { color: colors.white },
  nodeStars: { marginTop: 1, fontSize: 13, letterSpacing: 1, color: colors.starEmpty },
  starOn: { color: colors.star },
  levelName: {
    position: 'absolute',
    top: NODE_Y - 18,
    width: 120,
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  levelNameLocked: { color: colors.inkSoft },
  marker: { position: 'absolute', left: '50%', top: NODE_Y - NODE / 2 - 22 },
});
