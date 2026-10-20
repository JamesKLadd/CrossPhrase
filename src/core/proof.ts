import { createGame, entryWords, gameReducer } from './game';
import { isGrammatical } from './grammar';
import type { RunAction } from './run';
import type { CellKey, LevelDef } from './types';

// A board's proof: the moves (placements and swaps) the bot used to fill it
// in plain English when it was generated, saved by the generators to
// src/data/proofs.generated.json. Replaying a proof shows the board can be
// cleared without running the bot again, so it stays shown however the
// built-in judge's model or the bot's search change later. The app never
// loads the proofs (they'd give the answers away); the tests do.

type ProofMove = Extract<RunAction, { type: 'place' | 'swap' }>;

/** "p12@1,3" places tile 12 in row 1, column 3; "s7" swaps tile 7. */
export function encodeProof(moves: readonly RunAction[]): string {
  return moves
    .map((move) => {
      if (move.type === 'place') return `p${move.tileId}@${move.cell}`;
      if (move.type === 'swap') return `s${move.tileId}`;
      throw new Error(`A proof only places and swaps, not ${move.type}`);
    })
    .join(' ');
}

export function decodeProof(text: string): ProofMove[] {
  return text
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      const place = token.match(/^p(\d+)@(\d+,\d+)$/);
      if (place) return { type: 'place', tileId: Number(place[1]), cell: place[2] as CellKey };
      const swap = token.match(/^s(\d+)$/);
      if (swap) return { type: 'swap', tileId: Number(swap[1]) };
      throw new Error(`Not a proof move: ${token}`);
    });
}

/** What's wrong with a proof for this board, or null if it clears the board in plain English with a swap to spare. */
export function proofProblem(level: LevelDef, proof: string): string | null {
  let state = createGame(level);
  const moves = decodeProof(proof);
  for (const [i, move] of moves.entries()) {
    const next = gameReducer(state, move);
    if (next === state) return `move ${i + 1} isn't allowed`;
    state = next;
  }
  if (state.swapsLeft <= 0) return 'it uses every swap';
  for (const entry of state.entries) {
    const words = entryWords(state, entry);
    if (!words) return `line ${entry.id} isn't filled`;
    if (!isGrammatical(words, { strict: true })) return `line ${entry.id} ("${words.join(' ')}") isn't plain English`;
  }
  return null;
}
