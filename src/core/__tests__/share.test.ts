import { createGame, gameReducer, pendingJudgeEntries } from '../game';
import { shareText } from '../share';
import type { LevelDef, Tier } from '../types';

const level: LevelDef = {
  id: 't',
  name: 'T',
  theme: 'breakfast',
  layout: ['....', '.###', '.###', '.###'],
  swaps: 3,
  stars: [5, 10, 15],
  seed: 3,
  deck: ['the', 'golden', 'toast', 'melts', 'sleepy', 'chef', 'yawns'],
};

describe('shareText', () => {
  it('shows the board as squares, with no words', () => {
    let state = createGame(level);
    for (const cell of ['0,0', '0,1', '0,2', '0,3', '1,0', '2,0', '3,0'] as const) {
      state = gameReducer(state, { type: 'place', tileId: state.hand[0].id, cell });
    }
    state = gameReducer(state, { type: 'submitStart' });
    const tiers: Record<string, Tier> = { '1A': 'great', '1D': 'ok' };
    state = gameReducer(state, {
      type: 'submitResult',
      verdicts: pendingJudgeEntries(state).map((e) => ({
        entryId: e.id,
        valid: true,
        tier: tiers[e.id],
        reading: '',
        reason: '',
        quip: '',
      })),
    });
    const text = shareText(state, 'daily · Mon 19 Oct');
    expect(text.split('\n')).toEqual([
      '🦉 CrossPhrase daily · Mon 19 Oct',
      `${'★'.repeat(state.lastResult!.stars)}${'☆'.repeat(3 - state.lastResult!.stars)} ${state.lastResult!.total} points · 1 submit`,
      '🟩🟩🟩🟩',
      '🟦⬛⬛⬛',
      '🟦⬛⬛⬛',
      '🟦⬛⬛⬛',
    ]);
    for (const word of level.deck!) expect(text).not.toContain(word);
  });
});
