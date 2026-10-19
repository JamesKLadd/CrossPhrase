import bundledModel from '../data/judgeModel.json';
import { predict, type TinyModel } from './tinyJudge';
import type { JudgeEntry, Pos, Tier, Verdict } from './types';
import { wordInfo } from './words';

// The built-in judge: a few hard grammar rules, then the tiny trained model
// (src/core/tinyJudge.ts) for everything the rules let through. It needs no
// network, so it's the default judge and the offline fallback. The PC judge
// runs the same rules before asking its bigger model.

const GLUE: ReadonlySet<Pos> = new Set(['det', 'prep', 'conj']);
const CONTENT: ReadonlySet<Pos> = new Set(['noun', 'verb', 'adj', 'pron']);
const DET: ReadonlySet<Pos> = new Set(['det']);

export const BUNDLED_MODEL = bundledModel as TinyModel;

const QUIPS: Record<Tier, string[]> = {
  invalid: [
    'I adjusted my glasses twice. Still nonsense.',
    'Hoo wrote this? Try again.',
    'Even my feathers are confused.',
  ],
  ok: [
    'Grammatical. I suppose that counts for something.',
    'It parses. My standards remain unmoved.',
    'Acceptable. Barely, but acceptable.',
    'Fine. Not poetry, but fine.',
    'Adequate. I have read worse. Recently, even.',
  ],
  great: [
    'Oh, that one has a pulse.',
    'Now we are getting somewhere.',
    'I may underline that one.',
  ],
  poetic: [
    'I need a moment. That was lovely.',
    'Someone frame this immediately.',
    'My spectacles fogged up a little.',
  ],
};

function only(word: string, tags: ReadonlySet<Pos>): boolean {
  return wordInfo(word).pos.every((pos) => tags.has(pos));
}

function pick(list: string[], seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return list[Math.abs(hash) % list.length];
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
    quip: pick(QUIPS[tier], phrase),
  };
}
