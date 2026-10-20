import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ECONOMY_FROM_LEVEL, starReward } from '../../core/economy';
import { tuneLevel } from '../../core/tuning';
import type { LevelDef } from '../../core/types';
import { LEVEL_IDS, LEVELS, levelById, levelNumber } from '../../data/levels';
import { wallet } from '../../economy';
import { isUnlocked, progress, useProgress } from '../../progress';
import { remoteConfig } from '../../remote';
import { submitLevelScore } from '../../scores';
import { GameView } from '../../ui/GameView';
import { OutOfHearts } from '../../ui/OutOfHearts';
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
  // Keyed so moving to the next level, or replaying, starts a fresh attempt.
  return (
    <LevelAttempt key={`${level.id}:${attempt}`} level={level} onReplay={() => setAttempt((a) => a + 1)} />
  );
}

/** One go at a level. After the tutorial a go needs a heart, checked as it starts. */
function LevelAttempt({ level, onReplay }: { level: LevelDef; onReplay: () => void }) {
  const number = levelNumber(level.id);
  const economy = number >= ECONOMY_FROM_LEVEL;
  const [ready, setReady] = useState(() => !economy || wallet.lives().lives > 0);
  if (!ready) return <OutOfHearts onPlay={() => setReady(true)} />;
  return <LevelGame level={level} number={number} economy={economy} onReplay={onReplay} />;
}

function LevelGame({
  level: plain,
  number,
  economy,
  onReplay,
}: {
  level: LevelDef;
  number: number;
  economy: boolean;
  onReplay: () => void;
}) {
  // Difficulty tuning from the remote config, fixed for the whole attempt.
  const [level] = useState(() => tuneLevel(plain, number, remoteConfig.snapshot().tuning));
  const next = LEVELS[number];
  /** The best score before this attempt, to spot a new best. */
  const [previousBest] = useState(() => progress.snapshot().levels[level.id]?.best ?? null);
  const [earned, setEarned] = useState(0);
  const submitted = useRef(false);

  return (
    <GameView
      level={level}
      title={`${number}. ${level.name}`}
      backLabel="Levels"
      stats={{ mode: 'level', number }}
      economy={economy}
      // Save every clear. A re-check after an offline win can raise the score, so this runs again then.
      onChange={(state, log) => {
        if (state.phase !== 'won' || !state.lastResult) return;
        const starsBefore = progress.snapshot().levels[level.id]?.stars ?? 0;
        progress.record(level.id, state.lastResult);
        const reward = starReward(starsBefore, state.lastResult.stars, remoteConfig.snapshot().economy);
        if (reward > 0) {
          wallet.earn(reward);
          setEarned((e) => e + reward);
        }
        // Each clear without boosters goes to the leaderboard once; the server keeps the best.
        if (!submitted.current && state.boosts === 0) {
          submitted.current = true;
          submitLevelScore(level.id, log);
        }
      }}
      heading={(state) => (state.phase === 'won' ? `Level ${number} cleared!` : 'Out of submits')}
      newBest={(state) =>
        state.phase === 'won' && previousBest !== null && (state.lastResult?.total ?? 0) > previousBest
      }
      note={(state) =>
        state.phase === 'won' && earned > 0
          ? `+${earned} 🪶 for new stars`
          : state.phase === 'lost' && economy && remoteConfig.snapshot().economy.lives.enabled
            ? 'That cost a heart.'
            : null
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
