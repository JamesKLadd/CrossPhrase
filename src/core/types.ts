export type Pos = 'noun' | 'verb' | 'adj' | 'adv' | 'det' | 'pron' | 'prep' | 'conj' | 'interj';

export type Tier = 'invalid' | 'ok' | 'great' | 'poetic';

export type Direction = 'across' | 'down';

/** "row,col", e.g. "0,2". */
export type CellKey = `${number},${number}`;

export interface Entry {
  /** Crossword-style id, e.g. "1A" (1 across) or "3D" (3 down). */
  id: string;
  number: number;
  direction: Direction;
  cells: CellKey[];
}

export interface LevelDef {
  id: string;
  name: string;
  theme: string;
  /** One string per row: '.' is an open cell, '#' is blocked. */
  layout: string[];
  /** Pre-filled, locked words. */
  anchors?: Partial<Record<CellKey, string>>;
  /** Soft part-of-speech suggestions shown on cells. Never enforced. */
  hints?: Partial<Record<CellKey, Pos>>;
  swaps: number;
  /** Score needed for 1, 2 and 3 stars. Derived from the layout when omitted. */
  stars?: [number, number, number];
  seed: number;
}

export interface Tile {
  id: number;
  word: string;
  anchor?: boolean;
}

/** What the judge is asked about one entry. */
export interface JudgeEntry {
  id: string;
  words: string[];
}

export interface Verdict {
  entryId: string;
  valid: boolean;
  tier: Tier;
  /** The phrase as the judge read it (nouns may be pluralised). */
  reading: string;
  /** Why an invalid phrase failed; empty when valid. */
  reason: string;
  /** The owl's one-liner. */
  quip: string;
  /**
   * Graded offline by the local rules and waiting to be re-checked by the AI
   * judge. Provisional verdicts are never revoked, only upgraded.
   */
  provisional?: boolean;
}

/** A verdict from the AI judge for a phrase, used to resolve provisional ones. */
export interface PhraseVerdict {
  phrase: string;
  verdict: Omit<Verdict, 'entryId'>;
}

export interface SubmitResult {
  passed: boolean;
  /** Score per entry id, after the tier multiplier. */
  entryScores: Record<string, number>;
  raw: number;
  penalty: number;
  total: number;
  stars: 0 | 1 | 2 | 3;
}
