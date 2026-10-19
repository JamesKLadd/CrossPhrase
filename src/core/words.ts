import data from '../data/words.json';
import type { Pos } from './types';

export interface WordInfo {
  pos: Pos[];
  zipf: number;
}

const WORDS = data.words as Record<string, WordInfo>;
const POOLS = data.pools as Record<string, string[]>;

export const CORE_POOL = 'core';

export function isWord(word: string): boolean {
  return Object.prototype.hasOwnProperty.call(WORDS, word);
}

export function wordInfo(word: string): WordInfo {
  const info = WORDS[word];
  if (!info) throw new Error(`Unknown word: ${word}`);
  return info;
}

export function poolWords(pool: string): string[] {
  const words = POOLS[pool];
  if (!words) throw new Error(`Unknown word pool: ${pool}`);
  return words;
}

export function allWords(): string[] {
  return Object.keys(WORDS);
}

export function poolNames(): string[] {
  return Object.keys(POOLS);
}

/** Words are stored lowercase; this restores the few that need capitals. A blank wildcard is a star. */
export function displayWord(word: string): string {
  return word === 'i' ? 'I' : word === '*' ? '★' : word;
}
