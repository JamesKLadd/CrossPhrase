import { useEffect, useState } from 'react';

import { BUNDLED_MODEL } from '../core/localJudge';
import { judgeService } from '../judge';

/** One line describing which judge will grade phrases right now. */
export function useJudgeStatus(): string {
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!judgeService.hasRemote) return;
    let cancelled = false;
    judgeService.isRemoteReachable().then((ok) => !cancelled && setReachable(ok));
    return () => {
      cancelled = true;
    };
  }, []);

  const trained = BUNDLED_MODEL.trainedOn.human ?? 0;
  const builtIn = `the built-in judge (trained on ${trained} of your labels)`;
  if (!judgeService.hasRemote) return `Judge: ${builtIn}.`;
  const name = judgeService.remoteKind === 'pc' ? 'your PC judge' : 'the Claude judge';
  if (reachable === null) return `Judge: checking ${name}…`;
  return reachable
    ? `Judge: ${name} is connected.`
    : `Judge: can't reach ${name}, so ${builtIn} fills in for now.`;
}
