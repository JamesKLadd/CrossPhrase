import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  canSubmit,
  createGame,
  gameReducer,
  pendingJudgeEntries,
  type GameAction,
  type GameState,
} from '../core/game';
import type { LevelDef, Tier } from '../core/types';
import { judgeService, type JudgeMode } from '../judge';
import { haptic, playSound } from './feedback';

/** How often to retry offline phrases while any are queued. */
const RECONCILE_INTERVAL_MS = 30_000;

export function useGame(level: LevelDef) {
  const [state, rawDispatch] = useReducer(gameReducer, level, createGame);
  const [error, setError] = useState<string | null>(null);
  /** How the last submit was judged. */
  const [mode, setMode] = useState<JudgeMode | null>(null);
  /** A one-off line from the owl (correction noted, offline rulings re-checked...). */
  const [notice, setNotice] = useState<string | null>(null);
  /** Phrases the player has corrected this game, with the tier they gave. */
  const [corrections, setCorrections] = useState<ReadonlyMap<string, Tier>>(new Map());
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const dispatch = useCallback((action: GameAction) => {
    if (action.type === 'place' || action.type === 'move') {
      haptic('tap');
      playSound('place');
    } else if (action.type === 'swap') {
      haptic('select');
      playSound('swap');
    } else if (action.type === 'remove') {
      playSound('tap');
    }
    rawDispatch(action);
  }, []);

  const reconcile = useCallback(async () => {
    if (judgeService.pendingCount() === 0) return;
    const verdicts = await judgeService.reconcile();
    if (verdicts.length === 0) return;
    rawDispatch({ type: 'reconcile', verdicts });
    if (modeRef.current === 'offline') {
      setMode('online');
      setNotice("Back online. I've double-checked my offline rulings.");
    }
  }, []);

  // Re-check offline phrases and send queued labels on mount, whenever the
  // app returns to the foreground, and periodically while any are waiting.
  useEffect(() => {
    if (!judgeService.hasRemote) return;
    const run = () => {
      reconcile().catch((e) => console.warn('Reconcile failed:', e));
      if (judgeService.unsentLabelCount() > 0) void judgeService.syncLabels();
    };
    run();
    const timer = setInterval(run, RECONCILE_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [reconcile]);

  const submit = useCallback(
    async (current: GameState) => {
      if (!canSubmit(current)) return;
      setError(null);
      setNotice(null);
      rawDispatch({ type: 'submitStart' });
      try {
        const outcome = await judgeService.judge(pendingJudgeEntries(current));
        setMode(outcome.mode);
        rawDispatch({ type: 'submitResult', verdicts: outcome.verdicts });
        // We're online, so it's a good moment to clear any older offline queue.
        if (outcome.mode === 'online') void reconcile().catch(() => {});
      } catch (e) {
        console.warn(e);
        setError(String(e));
        haptic('error');
        rawDispatch({ type: 'submitError' });
      }
    },
    [reconcile],
  );

  /**
   * The player says the owl got a phrase wrong. The ruling stands for this
   * level, but the correction is saved as training data (and, with the cloud
   * judge, a rejected phrase becomes an appeal).
   */
  const correct = useCallback((phrase: string, judged: Tier, tier: Tier) => {
    setCorrections((prev) => new Map(prev).set(phrase, tier));
    judgeService.label({ phrase, tier, judged, source: 'play' });
    setNotice(
      tier === judged
        ? 'So we agree after all. How novel.'
        : 'Noted. I shall consult the dictionary, and my conscience.',
    );
    void judgeService.syncLabels();
  }, []);

  return {
    state,
    dispatch,
    submit: () => submit(state),
    error,
    mode,
    notice,
    corrections,
    correct,
  };
}
