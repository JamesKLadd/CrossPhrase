import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { GameState } from '../core/game';
import type { RunAction } from '../core/run';
import { shareText } from '../core/share';
import type { LevelDef } from '../core/types';
import { addDays, dailyLevel, dayKey, dayLabel } from '../data/dailies';
import { dailyStreak, progress } from '../progress';
import { scoresEnabled, submitDailyScore } from '../scores';
import { GameView } from '../ui/GameView';
import { colors } from '../ui/theme';

const previousDay = (day: string) => addDays(day, -1);

/**
 * Today's daily puzzle: the same board for everyone, one attempt (saved move
 * by move, so leaving and coming back resumes it), judged by the built-in
 * judge so every player, and the leaderboard, judges it the same way.
 */
export default function DailyScreen() {
  const [day] = useState(() => dayKey());
  const level = dailyLevel(day);
  if (!level) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.missing}>
          {"There's no daily puzzle for today in this version of the game. An update will bring more."}
        </Text>
        <Pressable onPress={() => router.back()} style={styles.missingBack}>
          <Text style={styles.back}>‹ Home</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  return <DailyGame level={level} day={day} />;
}

function DailyGame({ level, day }: { level: LevelDef; day: string }) {
  const [resume] = useState(() => progress.snapshot().daily[day]?.log ?? []);
  const title = `Daily · ${dayLabel(day)}`;

  const save = (state: GameState, log: readonly RunAction[]) => {
    const before = progress.snapshot().daily[day];
    if (before?.finished || (log.length === 0 && !before)) return;
    const finished = state.phase === 'won' || state.phase === 'lost';
    progress.saveDaily(day, {
      log: [...log],
      finished,
      won: state.phase === 'won',
      stars: state.phase === 'won' ? (state.lastResult?.stars ?? 0) : 0,
      total: state.lastResult?.total ?? 0,
      submitted: false,
    });
    if (finished && scoresEnabled) void submitDailyScore(day, log);
  };

  const share = (state: GameState) => {
    Share.share({ message: shareText(state, `daily · ${dayLabel(day)}`) }).catch(() => {});
  };

  return (
    <GameView
      level={level}
      title={title}
      backLabel="Home"
      options={{ judge: 'builtin', resume }}
      onChange={save}
      heading={(state) => (state.phase === 'won' ? 'Daily puzzle solved!' : 'Out of submits')}
      note={() => {
        const streak = dailyStreak(progress.snapshot(), day, previousDay);
        return streak > 1 ? `🔥 ${streak}-day streak` : null;
      }}
      actions={(state) => [
        { label: 'Share', primary: true, onPress: () => share(state) },
        ...(scoresEnabled ? [{ label: 'Leaderboard', onPress: () => router.push('/leaderboards') }] : []),
        { label: 'Home', onPress: () => router.back() },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  missing: { margin: 24, fontSize: 16, lineHeight: 22, color: colors.ink },
  missingBack: { marginHorizontal: 24 },
  back: { fontSize: 15, fontWeight: '700', color: colors.wood },
});
