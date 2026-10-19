import { nextRandom } from './rng';
import type { Tier } from './types';
import { wordInfo } from './words';

// The judge that ships inside the game: a small logistic-regression model
// over part-of-speech patterns and word pairs. It's trained offline by
// scripts/train-judge.ts (from your labels, the PC model's verdicts and a
// generated starter set) into src/data/judgeModel.json, and runs anywhere,
// instantly, with no network. Training and the game share this file's
// feature code, so they can't drift apart.

export interface Head {
  bias: number;
  weights: Record<string, number>;
}

export interface TinyModel {
  version: 1;
  /**
   * valid: is the phrase acceptable at all?
   * great: given valid, is it great or better?
   * poetic: given great, is it poetic?
   * A head is null when there wasn't enough data to train it; it then never fires.
   */
  heads: { valid: Head | null; great: Head | null; poetic: Head | null };
  trainedOn: Record<string, number>;
  trainedAt: string;
  metrics: Record<string, number>;
}

export interface Prediction {
  tier: Tier;
  pValid: number;
  pGreat: number;
  pPoetic: number;
}

export interface Example {
  words: string[];
  tier: Tier;
  /** How much to trust this example: human labels 1, PC-model verdicts less, generated ones least. */
  weight: number;
}

export type Features = Map<string, number>;

/**
 * Soft part-of-speech features: a word listed under several parts of speech
 * spreads its count across them, so "toast" (noun or verb) counts half for each.
 */
export function phraseFeatures(words: string[]): Features {
  const f: Features = new Map();
  const add = (key: string, value = 1) => f.set(key, (f.get(key) ?? 0) + value);
  const tags = [['^'], ...words.map((w) => wordInfo(w).pos as string[]), ['$']];

  for (let i = 1; i < tags.length; i++) {
    const share = 1 / (tags[i - 1].length * tags[i].length);
    for (const a of tags[i - 1]) for (const b of tags[i]) add(`t2:${a}>${b}`, share);
  }
  for (let i = 2; i < tags.length; i++) {
    const share = 1 / (tags[i - 2].length * tags[i - 1].length * tags[i].length);
    for (const a of tags[i - 2]) {
      for (const b of tags[i - 1]) for (const c of tags[i]) add(`t3:${a}>${b}>${c}`, share);
    }
  }
  words.forEach((word, i) => {
    const next = tags[i + 2];
    const prev = tags[i];
    for (const t of next) add(`wt:${word}>${t}`, 1 / next.length);
    for (const t of prev) add(`tw:${t}>${word}`, 1 / prev.length);
    if (i > 0) add(`wb:${words[i - 1]} ${word}`);
  });
  add(`len:${Math.min(words.length, 6)}`);
  return f;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

function score(head: Head | null, features: Features): number {
  if (!head) return 0;
  let z = head.bias;
  for (const [key, value] of features) z += (head.weights[key] ?? 0) * value;
  return sigmoid(z);
}

export function predict(model: TinyModel, words: string[]): Prediction {
  const features = phraseFeatures(words);
  // An untrained valid head means "no opinion": let the phrase through.
  const pValid = model.heads.valid ? score(model.heads.valid, features) : 1;
  const pGreat = score(model.heads.great, features);
  const pPoetic = score(model.heads.poetic, features);
  const tier: Tier =
    pValid < 0.5 ? 'invalid' : pGreat < 0.5 ? 'ok' : pPoetic < 0.5 ? 'great' : 'poetic';
  return { tier, pValid, pGreat, pPoetic };
}

interface Sample {
  x: Features;
  y: 0 | 1;
  w: number;
}

export interface TrainOptions {
  epochs?: number;
  learningRate?: number;
  l2?: number;
  seed?: number;
  /** A head is only trained when it has at least this many examples of each class. */
  minPerClass?: number;
  /** Features seen in fewer examples than this are ignored (they'd only memorise noise). */
  minFeatureCount?: number;
}

/** Logistic regression with AdaGrad and L2, sparse and seeded so runs are repeatable. */
function trainHead(samples: Sample[], opts: Required<TrainOptions>): Head | null {
  const positives = samples.filter((s) => s.y === 1).length;
  if (positives < opts.minPerClass || samples.length - positives < opts.minPerClass) return null;

  const counts = new Map<string, number>();
  for (const { x } of samples) for (const key of x.keys()) counts.set(key, (counts.get(key) ?? 0) + 1);
  const learnable = (key: string) => (counts.get(key) ?? 0) >= opts.minFeatureCount;

  const weights = new Map<string, number>();
  const grads = new Map<string, number>();
  let bias = 0;
  let biasGrad = 0;
  const order = samples.map((_, i) => i);
  let rng = opts.seed;

  for (let epoch = 0; epoch < opts.epochs; epoch++) {
    for (let i = order.length - 1; i > 0; i--) {
      let r: number;
      [r, rng] = nextRandom(rng);
      const j = Math.floor(r * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const index of order) {
      const { x, y, w } = samples[index];
      let z = bias;
      for (const [key, value] of x) z += (weights.get(key) ?? 0) * value;
      const g = (sigmoid(z) - y) * w;
      biasGrad += g * g;
      bias -= (opts.learningRate * g) / Math.sqrt(biasGrad + 1e-8);
      for (const [key, value] of x) {
        if (!learnable(key)) continue;
        const current = weights.get(key) ?? 0;
        const grad = g * value + opts.l2 * current;
        const acc = (grads.get(key) ?? 0) + grad * grad;
        grads.set(key, acc);
        weights.set(key, current - (opts.learningRate * grad) / Math.sqrt(acc + 1e-8));
      }
    }
  }

  const kept: Record<string, number> = {};
  for (const [key, value] of [...weights].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (Math.abs(value) >= 0.02) kept[key] = Math.round(value * 1e3) / 1e3;
  }
  return { bias: Math.round(bias * 1e4) / 1e4, weights: kept };
}

export function trainModel(
  examples: Example[],
  trainedOn: Record<string, number>,
  options: TrainOptions = {},
): TinyModel {
  const opts: Required<TrainOptions> = {
    epochs: 12,
    learningRate: 0.3,
    l2: 0.003,
    seed: 1,
    minPerClass: 5,
    minFeatureCount: 2,
    ...options,
  };
  const withFeatures = examples.map((e) => ({ ...e, x: phraseFeatures(e.words) }));
  const valid = withFeatures.map((e) => ({ x: e.x, w: e.weight, y: e.tier === 'invalid' ? 0 : 1 }) as Sample);
  const great = withFeatures
    .filter((e) => e.tier !== 'invalid')
    .map((e) => ({ x: e.x, w: e.weight, y: e.tier === 'great' || e.tier === 'poetic' ? 1 : 0 }) as Sample);
  const poetic = withFeatures
    .filter((e) => e.tier === 'great' || e.tier === 'poetic')
    .map((e) => ({ x: e.x, w: e.weight, y: e.tier === 'poetic' ? 1 : 0 }) as Sample);

  return {
    version: 1,
    heads: {
      valid: trainHead(valid, opts),
      great: trainHead(great, { ...opts, seed: opts.seed + 1 }),
      poetic: trainHead(poetic, { ...opts, seed: opts.seed + 2 }),
    },
    trainedOn,
    trainedAt: new Date().toISOString(),
    metrics: {},
  };
}
