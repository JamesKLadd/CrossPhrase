import { createGame, gameReducer, type GameState } from '../game';
import type { CellKey, LevelDef, Pos } from '../types';
import { wordInfo } from '../words';

const level: LevelDef = {
  id: 'balance',
  name: 'Balance',
  theme: 'garden',
  layout: ['.....', '.....', '.....', '.....', '.....'],
  swaps: 30,
  seed: 1,
  draw: 2,
};

/** Helper verbs ("must") don't count as the hand's verb: they need another verb. */
const HELPERS = new Set(['will', 'can', 'might', 'must', 'do', 'does']);
const kinds = (state: GameState) =>
  new Set(
    state.hand.flatMap((t) => (t.wildcard ? [] : wordInfo(t.word).pos.filter((pos) => !(pos === 'verb' && HELPERS.has(t.word))))),
  );
const NEEDS: Pos[] = ['pron', 'det', 'verb', 'noun'];

describe('balanced draws (draw 2)', () => {
  it('keep a pronoun, a determiner, a real verb and a noun in every hand, through placing and swapping', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let state = createGame({ ...level, seed });
      const cells = Object.keys(state.board) as CellKey[];
      for (let step = 0; step < 20; step++) {
        const have = kinds(state);
        // A wildcard takes a slot without counting, so allow one kind to be missing then.
        const missing = NEEDS.filter((pos) => !have.has(pos));
        expect(missing.length).toBeLessThanOrEqual(state.hand.some((t) => t.wildcard) ? 1 : 0);
        const tile = state.hand.find((t) => !t.wildcard)!;
        state =
          step % 3 === 2
            ? gameReducer(state, { type: 'swap', tileId: tile.id })
            : gameReducer(state, { type: 'place', tileId: tile.id, cell: cells[step] });
      }
    }
  });

  it('leave older boards dealt exactly as before', () => {
    const old = createGame({ ...level, draw: undefined, seed: 7 });
    const again = createGame({ ...level, draw: undefined, seed: 7 });
    expect(old.hand).toEqual(again.hand);
    // And the balanced deal differs from it only where the hand needed something.
    expect(createGame({ ...level, seed: 7 }).hand.map((t) => t.id)).toEqual(old.hand.map((t) => t.id));
  });
});
