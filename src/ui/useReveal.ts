import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { verdictFor, type GameState } from '../core/game';
import type { Entry, Tier } from '../core/types';

const STEP_MS = 450;
const FAST_STEP_MS = 90;

export interface Reveal {
  /** How many entries, in order, have their verdict showing. */
  shown: number;
  /** Still revealing the latest submit's verdicts. */
  active: boolean;
  /** The entry revealed most recently while a reveal is running. */
  current: Entry | null;
}

/**
 * After each submit, reveals the verdicts one line at a time (which also
 * covers judge latency in the feel of things), calling `onLine` for each
 * line as it appears and `onDone` at the end.
 */
export function useReveal(
  state: GameState,
  fast: boolean,
  onLine: (entry: Entry, tier: Tier, index: number) => void,
  onDone: () => void,
): Reveal {
  const [progress, setProgress] = useState({ submit: 0, shown: 0 });
  const latest = useRef({ state, onLine, onDone });
  useLayoutEffect(() => {
    latest.current = { state, onLine, onDone };
  });
  const { submitsUsed } = state;
  const total = state.entries.length;

  useEffect(() => {
    if (submitsUsed === 0) return;
    let shown = 0;
    const timer = setInterval(() => {
      const { state: current, onLine: line, onDone: done } = latest.current;
      const entry = current.entries[shown];
      shown++;
      setProgress({ submit: submitsUsed, shown });
      line(entry, verdictFor(current, entry)?.tier ?? 'invalid', shown - 1);
      if (shown >= total) {
        clearInterval(timer);
        done();
      }
    }, fast ? FAST_STEP_MS : STEP_MS);
    return () => clearInterval(timer);
  }, [submitsUsed, total, fast]);

  const shown = submitsUsed === 0 ? total : progress.submit === submitsUsed ? progress.shown : 0;
  const active = shown < total;
  return { shown, active, current: active && shown > 0 ? state.entries[shown - 1] : null };
}
