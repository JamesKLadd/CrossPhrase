import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';

import { zenLevel } from '../core/levelGen';
import { THEME_ORDER } from '../data/themes';
import { wallet } from '../economy';
import { progress, useProgress } from '../progress';
import { remoteConfig } from '../remote';
import { GameView } from '../ui/GameView';

/** Seeds for zen boards: different every session, then one after another. */
let nextSeed = Date.now() % 1_000_000_000;
const newBoard = () => {
  nextSeed += 7919;
  return { seed: nextSeed, theme: THEME_ORDER[nextSeed % THEME_ORDER.length] };
};

/**
 * Zen mode: endless boards with no star targets, no penalties and no limit on
 * submits or swaps. Clear a board and the next one is waiting.
 */
export default function ZenScreen() {
  const [board, setBoard] = useState(newBoard);
  const level = useMemo(() => zenLevel(board.seed, board.theme), [board]);
  const { zen } = useProgress();
  /** Boards already counted in the zen totals. */
  const counted = useRef(new Set<string>());

  return (
    <GameView
      key={level.id}
      level={level}
      title={`Zen · ${level.name}`}
      backLabel="Home"
      stats={{ mode: 'zen' }}
      onChange={(state) => {
        if (state.phase !== 'won' || !state.lastResult || counted.current.has(level.id)) return;
        counted.current.add(level.id);
        progress.recordZenBoard(state.lastResult.total);
        wallet.earn(remoteConfig.snapshot().economy.rewards.zenBoard);
      }}
      heading={() => 'Board cleared!'}
      note={() => `${zen.boards} ${zen.boards === 1 ? 'board' : 'boards'} in zen · ${zen.points} points`}
      actions={() => [
        { label: 'Next board', primary: true, onPress: () => setBoard(newBoard()) },
        { label: 'Home', onPress: () => router.back() },
      ]}
    />
  );
}
