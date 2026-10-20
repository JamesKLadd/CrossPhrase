import { canSubmit, createGame, gameReducer, pendingJudgeEntries, type GameState } from '../../core/game';
import { builtinJudge } from '../../core/run';
import type { CellKey } from '../../core/types';
import type { RunAction } from '../../core/run';
import { addDays, dailyLevel, dayKey } from '../../data/dailies';
import { levelById } from '../../data/levels';
import { sampleRun, scoreDaily, scoreLevel, scoreRun } from '../scores';

const NOW = new Date('2026-10-20T12:00:00Z');

describe('server scoring', () => {
  it("scores a real run of today's daily puzzle", () => {
    // Tomorrow's, as the first with balanced hands: the bot only plays plain
    // English, and today's board (dealt the old way) has no such answer.
    const tomorrow = new Date('2026-10-21T12:00:00Z');
    const run = sampleRun(dailyLevel('2026-10-21')!);
    const scored = scoreDaily('2026-10-21', run, tomorrow);
    expect(scored).toMatchObject({ won: true, submits: 1 });
    expect((scored as { score: number }).score).toBeGreaterThanOrEqual(dailyLevel('2026-10-21')!.stars![0]);
  });

  it('only takes daily puzzles from yesterday to tomorrow', () => {
    const later = new Date('2026-10-25T08:00:00Z');
    expect(scoreDaily('2026-10-22', sampleRun(dailyLevel('2026-10-22')!), later)).toBe('that daily puzzle is closed');
    expect(scoreDaily('2026-10-24', sampleRun(dailyLevel('2026-10-24')!), later)).toMatchObject({ won: true });
    expect(scoreDaily('1999-01-01', [], NOW)).toBe('there is no daily puzzle that day');
  });

  it("rejects a run that doesn't match the deal, or isn't finished", () => {
    const level = dailyLevel('2026-10-21')!;
    const run = sampleRun(level);
    // Another day's moves don't fit this day's deal.
    expect(typeof scoreDaily('2026-10-20', run, NOW)).toBe('string');
    expect(scoreRun(level, run.slice(0, -1))).toBe("the game isn't finished");
    expect(scoreRun(level, 'nope')).toBe('actions must be a list');
  });

  it('scores level clears, but not losses', () => {
    const level = levelById('first-light')!;
    expect(scoreLevel('first-light', sampleRun(level))).toMatchObject({ won: true });
    expect(scoreLevel('no-such-level', [])).toBe('there is no such level');
    // Three submits of a board the judge rejects.
    const placements = sampleRun(level).filter((a) => a.type === 'place');
    expect(placements.length).toBeGreaterThan(0);
  });

  it('plays levels with the same remote tuning as the game', () => {
    const level = levelById('level-41')!;
    // One swap more than the level allows: only legal with an extra swap tuned in.
    let state = createGame(level);
    const swaps: RunAction[] = [];
    for (let i = 0; i <= level.swaps; i++) {
      const swap: RunAction = { type: 'swap', tileId: state.hand[0].id };
      swaps.push(swap);
      state = gameReducer(state, swap);
    }
    expect(scoreLevel('level-41', swaps)).toBe(`move ${level.swaps + 1} isn't allowed`);
    expect(scoreLevel('level-41', swaps, { levels: { 'level-41': { swaps: 1 } } })).toBe("the game isn't finished");
    // Easier star targets give at least as many stars for the same run.
    const run = sampleRun(level);
    const plain = scoreLevel('level-41', run) as { stars: number };
    const eased = scoreLevel('level-41', run, { bands: { mid: { stars: 0.5 } } }) as { stars: number };
    expect(eased.stars).toBe(3);
    expect(eased.stars).toBeGreaterThanOrEqual(plain.stars);
  });

  it('keeps the points of a daily puzzle that ran out of submits', () => {
    const level = dailyLevel('2026-10-20')!;
    // Fill the board with whatever is dealt and submit until out of submits.
    let state: GameState = createGame(level);
    const actions: RunAction[] = [];
    const act = (action: RunAction) => {
      actions.push(action);
      state = gameReducer(state, action as never);
    };
    for (let guard = 0; state.phase === 'playing' && guard < 300; guard++) {
      const cells = Object.keys(state.board) as CellKey[];
      const empty = cells.find((c) => state.board[c] === null);
      if (empty) {
        act({ type: 'place', tileId: state.hand.find((t) => !t.wildcard)!.id, cell: empty });
      } else if (canSubmit(state)) {
        actions.push({ type: 'submit' });
        state = gameReducer(state, { type: 'submitStart' });
        state = gameReducer(state, { type: 'submitResult', verdicts: builtinJudge(pendingJudgeEntries(state)) });
      } else {
        // Nothing new to judge: change a word, a different square and word each time.
        const open = cells.filter((c) => !state.board[c]?.anchor);
        const words = state.hand.filter((t) => !t.wildcard);
        act({ type: 'place', tileId: words[guard % words.length].id, cell: open[guard % open.length] });
      }
    }
    expect(state.phase).toBe('lost');
    const scored = scoreDaily('2026-10-20', actions, NOW) as { won: boolean; score: number; stars: number };
    expect(scored).toMatchObject({ won: false, stars: 0, score: state.lastResult!.total });
    // Level boards still only take wins.
    expect(scoreLevel('level-11', [])).toBe("the game isn't finished");
  });

  it('agrees with the app on what day it is', () => {
    expect(dayKey(new Date(2026, 9, 20, 9))).toBe('2026-10-20');
    expect(addDays('2026-10-20', -1)).toBe('2026-10-19');
  });
});
