import { bandFor, STAR_BASELINE, ZEN_BAND, ZEN_SWAPS, type LevelBand } from './config';
import { cellKey, extractEntries, openCells, parseCellKey } from './grid';
import { playLevel, type BotRun } from './levelBot';
import { crossingCells, evaluateObjectives } from './objectives';
import { Rng, templateTags } from './phraseGen';
import { objectiveBonus } from './scoring';
import type { CellKey, Direction, Entry, LevelDef, Objective, Pos } from './types';
import { poolWords, wordInfo } from './words';

// The procedural level generator (docs/DESIGN.md §6). For a level number and
// theme it grows a crossword layout to fit the level's difficulty band, adds
// anchors, then has the bot (src/core/levelBot.ts) play it in real English.
// Layouts the bot can't solve with the level's own deal, with a swap to
// spare, are thrown away. The bot's scores set
// the star thresholds, its solution places the soft hints, and its runs show
// which bonus objectives are within reach. Everything is seeded, so the same
// inputs always give the same level. scripts/generate-levels.ts runs this and
// saves the results, so the game itself never runs the generator.

export { bandFor };

const randInt = (rng: Rng, min: number, max: number) => min + Math.floor(rng.next() * (max - min + 1));

function runCells(row: number, col: number, direction: Direction, length: number): CellKey[] {
  return Array.from({ length }, (_, i) =>
    direction === 'across' ? cellKey(row, col + i) : cellKey(row + i, col),
  );
}

function toLayout(open: ReadonlySet<CellKey>, rows: number, cols: number): string[] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (open.has(cellKey(r, c)) ? '.' : '#')).join(''),
  );
}

/** Trims fully blocked rows and columns from the edges. */
function crop(layout: string[]): string[] {
  const rows = layout.map((line, r) => (line.includes('.') ? r : -1)).filter((r) => r >= 0);
  const cols = [...layout[0]].map((_, c) => (layout.some((l) => l[c] === '.') ? c : -1)).filter((c) => c >= 0);
  const [c0, c1] = [cols[0], cols[cols.length - 1]];
  return layout.slice(rows[0], rows[rows.length - 1] + 1).map((line) => line.slice(c0, c1 + 1));
}

const signature = (cells: CellKey[]) => cells.join(' ');

/** At least this share of a layout's cells must be open, so boards don't sprawl. */
const MIN_FILL = 0.42;

/**
 * Grows a layout one entry at a time. Each new entry crosses at least one
 * existing entry and must add exactly one run: no merging into an existing
 * run, and no stray side-by-side cells that would form extra runs. Sprawling
 * layouts, and ones made mostly of the shortest entries, are rejected.
 */
export function growLayout(rng: Rng, band: LevelBand): string[] | null {
  const { maxRows: rows, maxCols: cols } = band;
  const target = randInt(rng, band.entries[0], band.entries[1]);
  const longest = (direction: Direction) =>
    Math.min(band.length[1], direction === 'across' ? cols : rows);

  const first: Direction = rng.next() < 0.5 ? 'across' : 'down';
  const len = randInt(rng, band.length[0], longest(first));
  const row = first === 'across' ? randInt(rng, 0, rows - 1) : randInt(rng, 0, rows - len);
  const col = first === 'across' ? randInt(rng, 0, cols - len) : randInt(rng, 0, cols - 1);
  let open = new Set(runCells(row, col, first, len));
  let runs = new Set([signature([...open])]);

  for (let attempt = 0; attempt < 400 && runs.size < target; attempt++) {
    const [ar, ac] = parseCellKey(rng.pick([...open]));
    const direction: Direction = rng.next() < 0.5 ? 'across' : 'down';
    const length = randInt(rng, band.length[0], longest(direction));
    const offset = randInt(rng, 0, length - 1);
    const [sr, sc] = direction === 'across' ? [ar, ac - offset] : [ar - offset, ac];
    if (sr < 0 || sc < 0 || (direction === 'across' ? sc + length > cols : sr + length > rows)) {
      continue;
    }
    const cells = runCells(sr, sc, direction, length);
    const sig = signature(cells);
    const crossings = cells.filter((c) => open.has(c)).length;
    if (runs.has(sig) || crossings === length) continue;
    if (crossings >= 2 && rng.next() >= band.loops) continue;

    const next = new Set([...open, ...cells]);
    const nextRuns = new Set(extractEntries(toLayout(next, rows, cols)).map((e) => signature(e.cells)));
    if (nextRuns.size !== runs.size + 1 || !nextRuns.has(sig)) continue;
    if (![...runs].every((s) => nextRuns.has(s))) continue;
    open = next;
    runs = nextRuns;
  }
  if (runs.size < band.entries[0]) return null;
  const layout = crop(toLayout(open, rows, cols));
  const lengths = [...runs].map((r) => r.split(' ').length);
  const averageLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (open.size / (layout.length * layout[0].length) < MIN_FILL) return null;
  if (averageLength < (band.length[0] + band.length[1]) / 2 - 0.5) return null;
  return layout;
}

type Role = 'start' | 'mid' | 'end';

function roles(cell: CellKey, entries: Entry[]): Role[] {
  return entries
    .filter((e) => e.cells.includes(cell))
    .map((e) => {
      const i = e.cells.indexOf(cell);
      return i === 0 ? 'start' : i === e.cells.length - 1 ? 'end' : 'mid';
    });
}

/** Friendly anchors: words that open a phrase, join two halves, or end one. */
const STARTERS = ['the', 'a', 'my', 'our', 'every', 'some', 'this', 'your', 'we', 'they', 'i'];
const LINKS = ['of', 'in', 'with', 'and', 'under', 'on', 'for', 'near', 'through', 'over'];

function themeNouns(theme: string, count: number): string[] {
  return poolWords(theme)
    .filter((w) => wordInfo(w).pos.includes('noun'))
    .sort((a, b) => wordInfo(b).zipf - wordInfo(a).zipf || (a < b ? -1 : 1))
    .slice(0, count);
}

function pickWeighted<T>(rng: Rng, items: { item: T; weight: number }[]): T | null {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const { item, weight } of items) {
    r -= weight;
    if (r < 0) return item;
  }
  return items[items.length - 1].item;
}

/**
 * Anchors, at most one per entry. Entry starts get an opener ("the", "we"),
 * entry middles a link word ("of", "and"), anything else a common theme noun.
 */
function pickAnchors(rng: Rng, layout: string[], theme: string, count: number) {
  const entries = extractEntries(layout);
  const nouns = themeNouns(theme, 12);
  const anchors: Partial<Record<CellKey, string>> = {};
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const options = openCells(layout)
      .filter((cell) => entries.every((e) => !e.cells.includes(cell) || !used.has(e.id)))
      .map((cell) => {
        const r = roles(cell, entries);
        const weight = r.every((x) => x === 'start') ? 3 : r.every((x) => x === 'mid') ? 2 : 1;
        return { item: { cell, r }, weight };
      });
    const choice = pickWeighted(rng, options);
    if (!choice) break;
    const { cell, r } = choice;
    anchors[cell] = r.every((x) => x === 'start')
      ? rng.pick(STARTERS)
      : r.every((x) => x === 'mid')
        ? rng.pick(LINKS)
        : rng.pick(nouns);
    for (const e of entries) if (e.cells.includes(cell)) used.add(e.id);
  }
  return anchors;
}

const HINT_PRIORITY: Pos[] = ['det', 'pron', 'prep', 'conj', 'noun', 'verb', 'adj', 'adv'];

/** Soft hints that agree with the bot's solution, preferring crossing cells. */
function pickHints(rng: Rng, run: BotRun, share: number): Partial<Record<CellKey, Pos>> {
  const { state } = run;
  const crossings = crossingCells(state.entries);
  const free = (Object.keys(state.board) as CellKey[]).filter((c) => !state.board[c]!.anchor);
  const count = share > 0 ? Math.max(1, Math.round(free.length * share)) : 0;
  const hints: Partial<Record<CellKey, Pos>> = {};
  const pool = free.map((cell) => ({ item: cell, weight: crossings.has(cell) ? 3 : 1 }));
  for (let i = 0; i < count && pool.length > 0; i++) {
    const cell = pickWeighted(rng, pool)!;
    pool.splice(pool.findIndex((p) => p.item === cell), 1);
    const entry = state.entries.find((e) => e.cells.includes(cell))!;
    const words = entry.cells.map((c) => state.board[c]!.word);
    const tags = templateTags(words);
    const word = state.board[cell]!.word;
    const hint = tags?.[entry.cells.indexOf(cell)] ?? HINT_PRIORITY.find((p) => wordInfo(word).pos.includes(p));
    if (hint) hints[cell] = hint;
  }
  return hints;
}

const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[sorted.length >> 1] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};

/**
 * Star thresholds from bot scores. `ownDeal` is the careful score on the deal
 * players actually get: 1★ never asks for more than that.
 */
export function starsFromRuns(
  careful: number[],
  greedy: number[],
  band: LevelBand,
  ownDeal = Infinity,
): [number, number, number] {
  const one = Math.max(4, Math.min(ownDeal, Math.round(median(careful) * band.oneStar)));
  const step = Math.max(1, Math.round(one * STAR_BASELINE.minStep));
  const three = Math.max(
    Math.round(median(greedy.length ? greedy : careful) * STAR_BASELINE.threeStars),
    one + 2 * step,
  );
  const two = Math.round((one + three) / 2);
  return [one, two, three];
}

/** Bonus objectives the bot's greedy runs reach sometimes but not always. */
function pickObjectives(rng: Rng, level: LevelDef, band: LevelBand, runs: BotRun[]): Objective[] {
  const count = randInt(rng, band.objectives[0], band.objectives[1]);
  if (count === 0) return [];
  const points = objectiveBonus(level);
  const late = band.from >= 101;
  const crossings = crossingCells(extractEntries(level.layout));
  const themeSet = new Set(poolWords(level.theme));
  const themeCounts = runs.map(
    (r) => Object.values(r.state.board).filter((t) => t && !t.anchor && themeSet.has(t.word)).length,
  );
  const freeCells = openCells(level.layout).length - Object.keys(level.anchors ?? {}).length;
  const candidates: Objective[] = [
    { kind: 'longWord', letters: late ? 8 : 7, points },
    {
      kind: 'themeWords',
      count: Math.min(freeCells, Math.max(2, Math.round(median(themeCounts)) + 1)),
      points,
    },
    { kind: 'swapsLeft', count: Math.max(1, Math.ceil(level.swaps / 2)), points },
    { kind: 'greatLines', count: 1, points },
  ];
  if (crossings.size > 0) candidates.push({ kind: 'rareCrossing', value: late ? 7 : 6, points });

  const chosen: Objective[] = [];
  const weighted: { item: Objective; weight: number }[] = candidates.map((objective) => {
    // The built-in judge rarely says "great", so the bot can't measure that one.
    if (objective.kind === 'greatLines') return { item: objective, weight: 1 };
    const single = { ...level, objectives: [objective] };
    const hits = runs.filter((r) => meets(single, r)).length / Math.max(1, runs.length);
    return { item: objective, weight: hits === 0 ? 0.5 : hits > 0.8 ? 1 : 3 };
  });
  while (chosen.length < count && weighted.length > 0) {
    const pick = pickWeighted(rng, weighted)!;
    chosen.push(pick);
    weighted.splice(weighted.findIndex((w) => w.item === pick), 1);
  }
  return chosen;
}

function meets(level: LevelDef, run: BotRun): boolean {
  const [result] = evaluateObjectives({
    level,
    entries: run.state.entries,
    board: run.state.board,
    tiers: run.tiers,
    swapsLeft: run.state.swapsLeft,
  });
  return result.met;
}

function titleCase(word: string): string {
  return word[0].toUpperCase() + word.slice(1);
}

/** A cozy name from the theme's own words, e.g. "Golden Toast" or "Comet & Lantern". */
export function levelName(rng: Rng, theme: string, taken: ReadonlySet<string>): string {
  const words = poolWords(theme);
  const nouns = words.filter((w) => wordInfo(w).pos.includes('noun'));
  const adjs = words.filter((w) => wordInfo(w).pos.includes('adj') && !wordInfo(w).pos.includes('noun'));
  let name = '';
  for (let attempt = 0; attempt < 30; attempt++) {
    const roll = rng.next();
    name =
      roll < 0.55 && adjs.length > 0
        ? `${titleCase(rng.pick(adjs))} ${titleCase(rng.pick(nouns))}`
        : roll < 0.8
          ? `${titleCase(rng.pick(nouns))} & ${titleCase(rng.pick(nouns))}`
          : `The ${titleCase(rng.pick(nouns))}`;
    if (!taken.has(name) && !/^(\w+) & \1$/.test(name)) return name;
  }
  return name;
}

export interface GeneratedLevel {
  level: LevelDef;
  /** How the bots did, for the generator's report. */
  stats: { attempts: number; carefulSolved: number; careful: number; greedy: number };
}

const PLAYTHROUGHS = 5;
/** Careful playthroughs that must succeed for a layout to be accepted outright. */
const GOOD_ENOUGH = 3;
/** If nothing reaches GOOD_ENOUGH, the best attempt is used, as long as it has this many. */
const AT_LEAST = 2;
/** Attempts before settling for the best layout found, if it has AT_LEAST. Most levels stop far sooner. */
const MAX_ATTEMPTS = 400;
/** Attempts before giving up when nothing has reached AT_LEAST: the biggest boards rarely grow or clear in plain English. */
const LAST_RESORT = 1500;

interface Attempt {
  base: LevelDef;
  /** The careful playthrough of the level's own deal. */
  first: BotRun;
  solved: BotRun[];
  attempt: number;
}

/**
 * Generates level `number`. Throws if no layout passes within LAST_RESORT attempts,
 * which means the band asks for more than the bot (and probably players) can do.
 */
export function generateLevel(options: {
  number: number;
  id: string;
  theme: string;
  seed: number;
  takenNames?: ReadonlySet<string>;
  /** Overrides the band for the level number (e.g. for daily puzzles). */
  band?: LevelBand;
}): GeneratedLevel {
  const band = options.band ?? bandFor(options.number);
  const rng = new Rng(options.seed);

  let best: Attempt | null = null;
  for (let attempt = 1; ; attempt++) {
    const found = best?.solved.length ?? 0;
    if (found >= GOOD_ENOUGH || attempt > LAST_RESORT || (attempt > MAX_ATTEMPTS && found >= AT_LEAST)) break;
    const layout = growLayout(rng, band);
    if (!layout) continue;
    const anchors = pickAnchors(rng, layout, options.theme, randInt(rng, band.anchors[0], band.anchors[1]));
    // Each attempt deals differently too: some deals are just unlucky.
    const seed = Math.floor(rng.next() * 2 ** 31);
    const base: LevelDef = {
      id: options.id,
      name: '',
      theme: options.theme,
      layout,
      anchors,
      swaps: band.swaps,
      seed,
      draw: 2,
    };

    // The level's own deal first: if the bot can't solve what players are dealt
    // in real English with a swap to spare, move on.
    // The other playthroughs stand in for players who are dealt differently by
    // swapping at other moments, and they steady the star thresholds.
    const first = playLevel(base, 'careful');
    if (!first.solved || first.swapsUsed >= base.swaps) continue;
    const others = Array.from({ length: PLAYTHROUGHS - 1 }, (_, i) =>
      playLevel(base, 'careful', { seed: (seed + (i + 1) * 7919) | 0 }),
    );
    const solved = [first, ...others.filter((r) => r.solved)];
    if (solved.length > (best?.solved.length ?? 0)) best = { base, first, solved, attempt };
  }
  if (!best || best.solved.length < AT_LEAST) {
    throw new Error(`No solvable layout for level ${options.number} after ${LAST_RESORT} attempts`);
  }

  const { base, first, solved, attempt } = best;
  const greedy = Array.from({ length: PLAYTHROUGHS }, (_, i) =>
    playLevel(base, 'greedy', { seed: (base.seed + i * 7919) | 0 }),
  ).filter((r) => r.solved);
  const level: LevelDef = {
    ...base,
    name: levelName(rng, options.theme, options.takenNames ?? new Set()),
    hints: pickHints(rng, first, band.hints),
    stars: starsFromRuns(
      solved.map((r) => r.score),
      greedy.map((r) => r.score),
      band,
      first.score,
    ),
  };
  const objectives = pickObjectives(rng, level, band, greedy.length ? greedy : solved);
  if (objectives.length > 0) level.objectives = objectives;
  if (Object.keys(level.anchors ?? {}).length === 0) delete level.anchors;
  if (Object.keys(level.hints ?? {}).length === 0) delete level.hints;
  return {
    level,
    stats: {
      attempts: attempt,
      carefulSolved: solved.length,
      careful: median(solved.map((r) => r.score)),
      greedy: greedy.length ? median(greedy.map((r) => r.score)) : 0,
    },
  };
}

/**
 * A zen board, made on the spot: a grown layout with friendly anchors and no
 * bot checks (zen boards can't be failed, so they don't need them).
 */
export function zenLevel(seed: number, theme: string): LevelDef {
  const rng = new Rng(seed);
  let layout: string[] | null = null;
  for (let attempt = 0; !layout && attempt < 200; attempt++) layout = growLayout(rng, ZEN_BAND);
  layout ??= ['....', '.###', '.###', '.###'];
  const anchors = pickAnchors(rng, layout, theme, randInt(rng, ZEN_BAND.anchors[0], ZEN_BAND.anchors[1]));
  return {
    id: `zen-${seed}`,
    name: levelName(rng, theme, new Set()),
    theme,
    layout,
    anchors,
    swaps: ZEN_SWAPS,
    seed,
    zen: true,
    draw: 2,
  };
}
