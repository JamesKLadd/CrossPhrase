// The judge's request handling, free of Supabase and Anthropic specifics so
// it can be tested with fakes (see judge_test.ts).

import { TIERS } from "../_shared/judgePrompt.ts";

export { TIERS };
export type Tier = (typeof TIERS)[number];

export const MAX_ENTRIES = 40;
export const MAX_WORDS_PER_ENTRY = 10;

export interface JudgeEntry {
  id: string;
  words: string[];
}

/** What the app receives for one entry. */
export interface Verdict {
  entryId: string;
  valid: boolean;
  tier: Tier;
  reading: string;
  reason: string;
  quip: string;
}

/** A row of the verdict_cache table. */
export interface CachedVerdict {
  phrase: string;
  tier: Tier;
  reading: string;
  reason: string;
  quip: string;
  prompt_version: number;
  source: "model" | "appeal";
}

/** What the model returns for one entry. */
export interface ModelVerdict {
  id: string;
  reading: string;
  tier: Tier;
  reason: string;
  quip: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface JudgeDeps {
  /** word -> parts of speech. Only dictionary words reach the model. */
  dictionary: ReadonlyMap<string, readonly string[]>;
  promptVersion: number;
  lookup(phrases: string[]): Promise<CachedVerdict[]>;
  save(rows: CachedVerdict[]): Promise<void>;
  recordHits(phrases: string[]): Promise<void>;
  callModel(entries: JudgeEntry[]): Promise<{ verdicts: ModelVerdict[]; usage: Usage }>;
}

export interface JudgeResult {
  verdicts: Verdict[];
  cacheHits: number;
  /** Null when every phrase came from the cache. */
  usage: Usage | null;
}

/** Returns the entries, or an error message for the caller. */
export function parseEntries(
  body: unknown,
  dictionary: ReadonlyMap<string, readonly string[]>,
): JudgeEntry[] | string {
  const entries = (body as { entries?: unknown })?.entries;
  if (!Array.isArray(entries) || entries.length === 0) return "entries must be a non-empty array";
  if (entries.length > MAX_ENTRIES) return `at most ${MAX_ENTRIES} entries per request`;
  const ids = new Set<string>();
  for (const entry of entries) {
    const { id, words } = (entry ?? {}) as Partial<JudgeEntry>;
    if (typeof id !== "string" || !/^\d{1,3}[AD]$/.test(id) || ids.has(id)) {
      return `bad or duplicate entry id: ${JSON.stringify(id)}`;
    }
    ids.add(id);
    if (!Array.isArray(words) || words.length < 2 || words.length > MAX_WORDS_PER_ENTRY) {
      return `entry ${id} must have 2-${MAX_WORDS_PER_ENTRY} words`;
    }
    if (words.some((w) => typeof w !== "string" || !dictionary.has(w))) {
      return `entry ${id} has a word not in the dictionary`;
    }
  }
  return entries as JudgeEntry[];
}

/**
 * The model's reading, if it only pluralised nouns as the rules allow;
 * otherwise the words as placed. Plurals are checked loosely (same stem),
 * which covers "fox"->"foxes", "berry"->"berries" and "leaf"->"leaves".
 */
export function checkedReading(
  words: string[],
  reading: string,
  dictionary: ReadonlyMap<string, readonly string[]>,
): string {
  const read = reading.toLowerCase().trim().split(/\s+/);
  const ok = read.length === words.length && read.every((r, i) => {
    const word = words[i];
    if (r === word) return true;
    const isNoun = dictionary.get(word)?.includes("noun") ?? false;
    const stem = word.slice(0, Math.max(2, word.length - 2));
    return isNoun && r.startsWith(stem) && r.length <= word.length + 3;
  });
  return ok ? read.join(" ") : words.join(" ");
}

/**
 * Judges a board: phrases already in the shared cache are answered from it,
 * and only new phrases go to the model (one request, deduplicated).
 */
export async function judgeEntries(entries: JudgeEntry[], deps: JudgeDeps): Promise<JudgeResult> {
  const phraseOf = (e: JudgeEntry) => e.words.join(" ");
  const phrases = [...new Set(entries.map(phraseOf))];

  const known = new Map<string, CachedVerdict>();
  try {
    for (const row of await deps.lookup(phrases)) {
      if (row.source === "appeal" || row.prompt_version === deps.promptVersion) {
        known.set(row.phrase, row);
      }
    }
  } catch (error) {
    // The cache is an optimisation; judging still works without it.
    console.error("verdict cache lookup failed", error);
  }
  const hits = phrases.filter((p) => known.has(p));

  const misses = new Map<string, JudgeEntry>();
  for (const entry of entries) {
    const phrase = phraseOf(entry);
    if (!known.has(phrase) && !misses.has(phrase)) misses.set(phrase, entry);
  }

  let usage: Usage | null = null;
  if (misses.size > 0) {
    const missEntries = [...misses.values()];
    const result = await deps.callModel(missEntries);
    usage = result.usage;
    const byId = new Map(result.verdicts.map((v) => [v.id, v]));
    const fresh: CachedVerdict[] = [];
    for (const entry of missEntries) {
      const v = byId.get(entry.id);
      if (!v || !TIERS.includes(v.tier)) continue;
      fresh.push({
        phrase: phraseOf(entry),
        tier: v.tier,
        reading: checkedReading(entry.words, v.reading, deps.dictionary),
        reason: v.tier === "invalid" ? v.reason : "",
        quip: v.quip,
        prompt_version: deps.promptVersion,
        source: "model",
      });
    }
    for (const row of fresh) known.set(row.phrase, row);
    await deps.save(fresh).catch((error) => console.error("verdict cache save failed", error));
  }
  if (hits.length > 0) {
    await deps.recordHits(hits).catch((error) => console.error("recording hits failed", error));
  }

  // An entry the model skipped gets no verdict; the app won't charge a submit for it.
  const verdicts = entries.flatMap((entry) => {
    const row = known.get(phraseOf(entry));
    if (!row) return [];
    return [{
      entryId: entry.id,
      valid: row.tier !== "invalid",
      tier: row.tier,
      reading: row.reading,
      reason: row.reason,
      quip: row.quip,
    }];
  });
  const cacheHits = entries.filter((e) => hits.includes(phraseOf(e))).length;
  return { verdicts, cacheHits, usage };
}
