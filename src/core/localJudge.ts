import type { JudgeEntry, Pos, Verdict } from './types';
import { wordInfo } from './words';

// A lenient, rule-based judge. It runs when no judge endpoint is configured
// (local development) and is the base for the offline fallback. It only ever
// grades phrases "ok" or "invalid"; tiers above that need the AI judge.

const GLUE: ReadonlySet<Pos> = new Set(['det', 'prep', 'conj']);
const CONTENT: ReadonlySet<Pos> = new Set(['noun', 'verb', 'adj', 'pron']);

const OK_QUIPS = [
  'Grammatical. I suppose that counts for something.',
  'It parses. My standards remain unmoved.',
  'Acceptable. Barely, but acceptable.',
  'Fine. Not poetry, but fine.',
  'Adequate. I have read worse. Recently, even.',
];
const INVALID_QUIPS = [
  'I adjusted my glasses twice. Still nonsense.',
  'Hoo wrote this? Try again.',
  'Even my feathers are confused.',
];

function only(word: string, tags: ReadonlySet<Pos>): boolean {
  return wordInfo(word).pos.every((pos) => tags.has(pos));
}

function pick(list: string[], seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return list[Math.abs(hash) % list.length];
}

function problem(words: string[]): string | null {
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
    const pair = [words[i - 1], words[i]];
    if (pair.every((w) => only(w, new Set<Pos>(['det'])))) {
      return 'Two articles in a row';
    }
  }
  return null;
}

export function localVerdict(entry: JudgeEntry): Verdict {
  const phrase = entry.words.join(' ');
  const reason = problem(entry.words);
  return {
    entryId: entry.id,
    valid: reason === null,
    tier: reason === null ? 'ok' : 'invalid',
    reading: phrase,
    reason: reason ?? '',
    quip: pick(reason === null ? OK_QUIPS : INVALID_QUIPS, phrase),
  };
}
