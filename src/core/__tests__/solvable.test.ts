import { createGame, entryWords, gameReducer } from '../game';
import { localVerdict } from '../localJudge';
import { decodeProof, proofProblem } from '../proof';
import type { LevelDef } from '../types';
import generatedDailies from '../../data/dailies.generated.json';
import { LEVELS } from '../../data/levels';
import generatedProofs from '../../data/proofs.generated.json';
import { TUTORIAL } from '../../data/tutorial';

// Every generated board has an answer a person would write: its proof (the
// bot's moves when it was generated, src/core/proof.ts) clears its own deal
// in plain English with a swap to spare, and the built-in judge passes every
// line. Proofs don't depend on the judge's model, so retraining it never
// breaks this; changing the grammar or the dealing rules can, and then the
// boards need regenerating (npm run generate:levels, or npm run
// generate:dailies -- --from <tomorrow>).

const proofs = generatedProofs.proofs as Record<string, string>;
// Days dealt with balanced hands (the two before were played already and keep their old deal).
const dailies = (generatedDailies.levels as unknown as LevelDef[]).filter((level) => level.draw === 2);
const boards = [...LEVELS.slice(TUTORIAL.length), ...dailies];

describe.each(boards.map((level) => [level.id, level] as const))('%s', (id, level) => {
  it('has a proof that clears it in plain English with a swap to spare', () => {
    expect(proofs[id]).toBeDefined();
    expect(proofProblem(level, proofs[id])).toBeNull();
  });

  it("passes the built-in judge on the proof's lines", () => {
    const state = decodeProof(proofs[id] ?? '').reduce(gameReducer, createGame(level));
    for (const entry of state.entries) {
      expect(localVerdict({ id: entry.id, words: entryWords(state, entry) ?? [] }).valid).toBe(true);
    }
  });
});
