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

/**
 * A bonus objective. Meeting it adds `points` to the level score. Objectives
 * are never required to pass.
 */
export type Objective =
  /** Use a word with at least this many letters. */
  | { kind: 'longWord'; letters: number; points: number }
  /** Get this many lines judged great or better. */
  | { kind: 'greatLines'; count: number; points: number }
  /** Use this many words from the level's theme pool (repeats count). */
  | { kind: 'themeWords'; count: number; points: number }
  /** Finish with at least this many swaps unused. */
  | { kind: 'swapsLeft'; count: number; points: number }
  /** Put a word worth at least this many points on a crossing cell. */
  | { kind: 'rareCrossing'; value: number; points: number };

export interface ObjectiveResult {
  objective: Objective;
  met: boolean;
  /** Progress so far, e.g. 2 of 3 theme words. */
  have: number;
  need: number;
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
  /**
   * Scripted draws for tutorial levels: the first words dealt, in order, before
   * random draws take over. '*' deals a wildcard.
   */
  deck?: string[];
  /** The owl's opening line, e.g. a tutorial tip. */
  intro?: string;
  objectives?: Objective[];
  /**
   * Zen mode: no star targets, no penalties and no limit on submits. The
   * board is cleared as soon as every line is valid.
   */
  zen?: boolean;
  /**
   * How hands are dealt. 2: every hand keeps at least one pronoun,
   * determiner, verb and noun (see drawTile in game.ts). Missing on boards
   * made before that, which keep their original deals (old daily puzzles
   * must replay exactly as they were played).
   */
  draw?: 2;
}

/** A deck entry that deals a wildcard tile. */
export const WILDCARD = '*';

export interface Tile {
  id: number;
  /** The word; '*' on a wildcard that hasn't been given a word yet. */
  word: string;
  anchor?: boolean;
  /** A wildcard: the player picks its word when placing it. */
  wildcard?: boolean;
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
  /** Points from bonus objectives met. */
  bonus: number;
  penalty: number;
  total: number;
  stars: 0 | 1 | 2 | 3;
  objectives: ObjectiveResult[];
}
