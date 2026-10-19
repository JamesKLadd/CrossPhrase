import { verdictFor, type GameState } from './game';
import { cellKey } from './grid';
import type { CellKey, Tier } from './types';

// The daily puzzle's share card: the board as coloured squares, no words, so
// it gives nothing away to friends who haven't played yet.

const SQUARE: Record<Tier, string> = {
  invalid: '🟥',
  ok: '🟦',
  great: '🟩',
  poetic: '🟪',
};
const RANK: Record<Tier, number> = { invalid: 0, ok: 1, great: 2, poetic: 3 };

/** Each cell's best tier among its judged lines. */
function bestTiers(state: GameState): Map<CellKey, Tier> {
  const tiers = new Map<CellKey, Tier>();
  for (const entry of state.entries) {
    const tier = verdictFor(state, entry)?.tier;
    if (!tier) continue;
    for (const cell of entry.cells) {
      const current = tiers.get(cell);
      if (!current || RANK[tier] > RANK[current]) tiers.set(cell, tier);
    }
  }
  return tiers;
}

export function shareText(state: GameState, title: string): string {
  const result = state.lastResult;
  const tiers = bestTiers(state);
  const grid = state.level.layout.map((line, row) =>
    [...line]
      .map((ch, col) => {
        if (ch === '#') return '⬛';
        const tier = tiers.get(cellKey(row, col));
        return tier ? SQUARE[tier] : '⬜';
      })
      .join(''),
  );
  const won = state.phase === 'won' && result;
  const summary = won
    ? `${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)} ${result.total} points`
    : 'Out of submits';
  return [
    `🦉 CrossPhrase ${title}`,
    `${summary} · ${state.submitsUsed} ${state.submitsUsed === 1 ? 'submit' : 'submits'}`,
    ...grid,
  ].join('\n');
}
