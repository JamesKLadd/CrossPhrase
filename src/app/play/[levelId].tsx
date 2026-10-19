import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { LevelDef } from '../../core/types';
import { LEVEL_IDS, LEVELS, levelById, levelNumber } from '../../data/levels';
import { isUnlocked, progress, useProgress } from '../../progress';
import { submitLevelScore } from '../../scores';
import { GameView } from '../../ui/GameView';
import { colors } from '../../ui/theme';

export default function PlayScreen() {
  const { levelId } = useLocalSearchParams<{ levelId: string }>();
  const level = levelById(levelId);
  const saved = useProgress();
  const [attempt, setAttempt] = useState(0);
  if (!level) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.missing}>No level called “{levelId}”.</Text>
      </SafeAreaView>
    );
  }
  const number = levelNumber(level.id);
  if (!isUnlocked(saved, LEVEL_IDS, number - 1)) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.missing}>
          Level {number} is locked. Clear level {number - 1} first.
        </Text>
        <Pressable onPress={() => router.replace('/')} style={styles.lockedBack}>
          <Text style={styles.back}>‹ Levels</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  // Keyed so moving to the next level, or replaying, starts a fresh game.
  return (
    <LevelGame key={`${level.id}:${attempt}`} level={level} onReplay={() => setAttempt((a) => a + 1)} />
  );
}

function LevelGame({ level, onReplay }: { level: LevelDef; onReplay: () => void }) {
  const number = levelNumber(level.id);
  const next = LEVELS[number];
  /** The best score before this attempt, to spot a new best. */
  const [previousBest] = useState(() => progress.snapshot().levels[level.id]?.best ?? null);

  return (
    <GameView
      level={level}
      title={`${number}. ${level.name}`}
      backLabel="Levels"
      // Save every clear. A re-check after an offline win can raise the score, so this runs again then.
      onChange={(state, log) => {
        if (state.phase !== 'won' || !state.lastResult) return;
        const { newBest } = progress.record(level.id, state.lastResult);
        if (newBest) submitLevelScore(level.id, log);
      }}
      heading={(state) => (state.phase === 'won' ? `Level ${number} cleared!` : 'Out of submits')}
      newBest={(state) =>
        state.phase === 'won' && previousBest !== null && (state.lastResult?.total ?? 0) > previousBest
      }
      actions={(state) =>
        state.phase === 'won'
          ? [
              ...(next ? [{ label: 'Next level', primary: true, onPress: () => router.replace(`/play/${next.id}`) }] : []),
              { label: 'Replay', onPress: onReplay },
              { label: 'Levels', onPress: () => router.back() },
            ]
          : [
              { label: 'Try again', primary: true, onPress: onReplay },
              { label: 'Levels', onPress: () => router.back() },
            ]
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  missing: { margin: 24, fontSize: 16, color: colors.ink },
  lockedBack: { marginHorizontal: 24 },
  back: { fontSize: 15, fontWeight: '700', color: colors.wood },
});
