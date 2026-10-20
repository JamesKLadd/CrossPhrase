import { DRAW_WEIGHTING } from './config';
import { nextRandom } from './rng';
import type { Pos } from './types';
import { CORE_POOL, poolWords, wordInfo } from './words';

export interface DrawPool {
  words: string[];
  /** Running total of weights, for binary search. */
  cumulative: number[];
}

export function drawWeight(word: string, fromTheme: boolean): number {
  const { base, pivot, cap, themeBoost, nounBoost } = DRAW_WEIGHTING;
  const { zipf, pos } = wordInfo(word);
  const weight = Math.min(cap, base ** (zipf - pivot)) * (pos.includes('noun') ? nounBoost : 1);
  return fromTheme ? weight * themeBoost : weight;
}

/** The core pool plus the theme's words (optionally only one part of speech, less `except`). Words in both get the theme boost. */
export function buildPool(theme: string, only?: Pos, except: ReadonlySet<string> = new Set()): DrawPool {
  const themeWords = new Set(theme === CORE_POOL ? [] : poolWords(theme));
  const words = [...new Set([...poolWords(CORE_POOL), ...themeWords])]
    .filter((word) => !only || (wordInfo(word).pos.includes(only) && !except.has(word)))
    .sort();
  const cumulative: number[] = [];
  let total = 0;
  for (const word of words) {
    total += drawWeight(word, themeWords.has(word));
    cumulative.push(total);
  }
  return { words, cumulative };
}

/** Draws one word (with replacement). Returns [word, next rng state]. */
export function drawWord(pool: DrawPool, rng: number): [string, number] {
  const [r, next] = nextRandom(rng);
  const target = r * pool.cumulative[pool.cumulative.length - 1];
  let lo = 0;
  let hi = pool.cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pool.cumulative[mid] > target) hi = mid;
    else lo = mid + 1;
  }
  return [pool.words[lo], next];
}
