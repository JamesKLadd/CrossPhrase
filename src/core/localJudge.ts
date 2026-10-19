import bundledModel from '../data/judgeModel.json';
import { quipFor } from './quips';
import { predict, type TinyModel } from './tinyJudge';
import type { JudgeEntry, Pos, Verdict } from './types';
import { wordInfo } from './words';

// The built-in judge: a few hard grammar rules, then the tiny trained model
// (src/core/tinyJudge.ts) for everything the rules let through. It needs no
// network, so it's the default judge and the offline fallback. The PC judge
// runs the same rules before asking its bigger model.

const GLUE: ReadonlySet<Pos> = new Set(['det', 'prep', 'conj']);
const CONTENT: ReadonlySet<Pos> = new Set(['noun', 'verb', 'adj', 'pron']);
const DET: ReadonlySet<Pos> = new Set(['det']);

export const BUNDLED_MODEL = bundledModel as TinyModel;

function only(word: string, tags: ReadonlySet<Pos>): boolean {
  return wordInfo(word).pos.every((pos) => tags.has(pos));
}

/** A hard grammar problem that makes a phrase invalid whatever any model says, or null. */
export function ruleProblem(words: string[]): string | null {
  if (!words.some((w) => wordInfo(w).pos.some((pos) => CONTENT.has(pos)))) {
    return 'Needs a noun, verb, adjective or pronoun';
  }
  if (only(words[words.length - 1], GLUE)) {
    return `Can't end on "${words[words.length - 1]}"`;
  }
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1] && only(words[i], GLUE)) {
      return `"${words[i]}" twice in a row`;
    }
    if (only(words[i - 1], DET) && only(words[i], DET)) {
      return `"${words[i - 1]} ${words[i]}" can't sit together`;
    }
  }
  return null;
}

export function localVerdict(entry: JudgeEntry, model: TinyModel = BUNDLED_MODEL): Verdict {
  const phrase = entry.words.join(' ');
  const rule = ruleProblem(entry.words);
  const tier = rule ? 'invalid' : predict(model, entry.words).tier;
  return {
    entryId: entry.id,
    valid: tier !== 'invalid',
    tier,
    reading: phrase,
    reason: rule ?? (tier === 'invalid' ? "Doesn't read naturally" : ''),
    quip: quipFor(tier, phrase),
  };
}
