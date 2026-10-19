import { MIN_ENTRY_LENGTH } from './config';
import { ruleProblem } from './localJudge';
import { nextRandom } from './rng';
import { predict, type Example, type TinyModel } from './tinyJudge';
import type { Pos } from './types';
import { allWords, wordInfo } from './words';

// Phrases built from the game's own words: a generated starter set for
// training the tiny judge before anyone has labelled anything, and the
// phrases shown on the labelling screen.

/** Part-of-speech shapes that usually read as English. */
const TEMPLATES: Pos[][] = [
  ['det', 'adj', 'noun'],
  ['det', 'noun', 'verb'],
  ['pron', 'verb'],
  ['noun', 'verb'],
  ['adj', 'noun'],
  ['verb', 'det', 'noun'],
  ['det', 'noun', 'verb', 'adv'],
  ['pron', 'verb', 'det', 'noun'],
  ['det', 'adj', 'noun', 'verb'],
  ['adv', 'adj', 'noun'],
  ['det', 'noun', 'prep', 'det', 'noun'],
  ['noun', 'prep', 'det', 'noun'],
  ['verb', 'prep', 'det', 'noun'],
  ['pron', 'verb', 'adj'],
  ['adj', 'noun', 'verb'],
  ['det', 'noun', 'conj', 'det', 'noun'],
  ['verb', 'adv'],
  ['det', 'adj', 'adj', 'noun'],
  // Headline-style lines without articles, which three-word boards are full of.
  ['noun', 'verb', 'noun'],
  ['noun', 'verb', 'adv'],
  ['pron', 'verb', 'noun'],
  ['pron', 'verb', 'adv'],
  ['verb', 'adj', 'noun'],
  ['noun', 'prep', 'noun'],
  ['noun', 'conj', 'noun'],
  ['adj', 'noun', 'verb', 'adv'],
  ['adj', 'noun', 'prep', 'noun'],
  ['det', 'noun', 'verb', 'noun'],
  ['verb', 'det', 'adj', 'noun'],
  ['det', 'adj', 'noun', 'verb', 'adv'],
];

export class Rng {
  constructor(private state: number) {}
  next(): number {
    const [value, state] = nextRandom(this.state);
    this.state = state;
    return value;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}

let byPos: Map<Pos, string[]> | null = null;
function wordsByPos(): Map<Pos, string[]> {
  if (!byPos) {
    byPos = new Map();
    for (const word of allWords()) {
      for (const pos of wordInfo(word).pos) {
        if (!byPos.has(pos)) byPos.set(pos, []);
        byPos.get(pos)!.push(word);
      }
    }
  }
  return byPos;
}

/** The first template that some reading of the words' parts of speech matches. */
export function templateTags(words: string[]): Pos[] | null {
  return (
    TEMPLATES.find(
      (t) => t.length === words.length && t.every((pos, i) => wordInfo(words[i]).pos.includes(pos)),
    ) ?? null
  );
}

/** True if some reading of the words' parts of speech matches a template. */
export function matchesTemplate(words: string[]): boolean {
  return templateTags(words) !== null;
}

export function templatePhrase(rng: Rng): string[] {
  const index = wordsByPos();
  return rng.pick(TEMPLATES).map((pos) => rng.pick(index.get(pos) ?? allWords()));
}

export function randomPhrase(rng: Rng): string[] {
  const words = allWords();
  const length = 2 + Math.floor(rng.next() * 4);
  return Array.from({ length }, () => rng.pick(words));
}

/**
 * A noisy starter set: template phrases count as "ok" and random word strings
 * that fit no template (or break a hard rule) as "invalid". Real labels and
 * the PC model's verdicts outweigh these in training.
 */
export function bootstrapExamples(count: number, seed: number, weight: number): Example[] {
  const rng = new Rng(seed);
  const examples: Example[] = [];
  while (examples.length < count) {
    if (examples.length % 2 === 0) {
      const words = templatePhrase(rng);
      if (!ruleProblem(words)) examples.push({ words, tier: 'ok', weight });
    } else {
      const words = randomPhrase(rng);
      if (ruleProblem(words) || !matchesTemplate(words)) {
        examples.push({ words, tier: 'invalid', weight });
      }
    }
  }
  return examples;
}

/**
 * The next phrase to ask a human about. Half are drawn to look plausible, a
 * quarter are random, and a quarter are the ones the tiny model is least sure
 * about, which teach it the most. Only phrases as long as a board's lines.
 */
export function labellingCandidate(rng: Rng, model: TinyModel, skip: ReadonlySet<string>): string[] {
  for (let attempt = 0; attempt < 50; attempt++) {
    const roll = rng.next();
    let words: string[];
    if (roll < 0.5) {
      words = templatePhrase(rng);
    } else if (roll < 0.75) {
      words = randomPhrase(rng);
    } else {
      const options = Array.from({ length: 12 }, () =>
        rng.next() < 0.5 ? templatePhrase(rng) : randomPhrase(rng),
      );
      words = options.reduce((best, w) =>
        Math.abs(predict(model, w).pValid - 0.5) < Math.abs(predict(model, best).pValid - 0.5)
          ? w
          : best,
      );
    }
    if (words.length < MIN_ENTRY_LENGTH) continue;
    if (!skip.has(words.join(' ')) && !ruleProblem(words)) return words;
  }
  return ['the', 'quiet', 'owl', 'reads'];
}
