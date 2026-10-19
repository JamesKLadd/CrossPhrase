import * as Haptics from 'expo-haptics';
import { useCallback, useReducer, useState } from 'react';
import { Platform } from 'react-native';

import {
  canSubmit,
  createGame,
  gameReducer,
  pendingJudgeEntries,
  type GameAction,
  type GameState,
} from '../core/game';
import type { LevelDef } from '../core/types';
import { judge } from '../judge/client';

function haptic(kind: 'tap' | 'success' | 'error') {
  if (Platform.OS === 'web') return;
  const run =
    kind === 'tap'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.notificationAsync(
          kind === 'success'
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Error,
        );
  run.catch(() => {});
}

export function useGame(level: LevelDef) {
  const [state, rawDispatch] = useReducer(gameReducer, level, createGame);
  const [error, setError] = useState<string | null>(null);

  const dispatch = useCallback((action: GameAction) => {
    if (action.type === 'place' || action.type === 'move') haptic('tap');
    rawDispatch(action);
  }, []);

  const submit = useCallback(
    async (current: GameState) => {
      if (!canSubmit(current)) return;
      setError(null);
      rawDispatch({ type: 'submitStart' });
      try {
        const verdicts = await judge.judge(pendingJudgeEntries(current));
        haptic(verdicts.some((v) => !v.valid) ? 'error' : 'success');
        rawDispatch({ type: 'submitResult', verdicts });
      } catch (e) {
        console.warn(e);
        setError(String(e));
        rawDispatch({ type: 'submitError' });
      }
    },
    [],
  );

  const restart = useCallback(() => {
    setError(null);
    rawDispatch({ type: 'restart' });
  }, []);

  return { state, dispatch, submit: () => submit(state), restart, error };
}
