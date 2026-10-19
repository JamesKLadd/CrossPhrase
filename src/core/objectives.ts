import { tileValue } from './scoring';
import type { CellKey, Entry, LevelDef, Objective, ObjectiveResult, Tier, Tile } from './types';
import { poolWords } from './words';

// Bonus objectives: optional goals that add points to a level's score. They
// are checked live while playing (to show progress) and again when a submit is
// scored. Anchors never count: objectives are about the words the player chose.

export interface ObjectiveContext {
  level: LevelDef;
  entries: Entry[];
  board: Record<CellKey, Tile | null>;
  /** The judged tier of each entry's current phrase, where there is one. */
  tiers: Record<string, Tier | undefined>;
  swapsLeft: number;
}

const themeSets = new Map<string, ReadonlySet<string>>();
function themeSet(theme: string): ReadonlySet<string> {
  let set = themeSets.get(theme);
  if (!set) {
    set = new Set(poolWords(theme));
    themeSets.set(theme, set);
  }
  return set;
}

function placedTiles(ctx: ObjectiveContext): [CellKey, Tile][] {
  return (Object.entries(ctx.board) as [CellKey, Tile | null][]).filter(
    (pair): pair is [CellKey, Tile] => pair[1] !== null && !pair[1].anchor,
  );
}

/** Cells that belong to two entries. */
export function crossingCells(entries: Entry[]): Set<CellKey> {
  const seen = new Set<CellKey>();
  const crossings = new Set<CellKey>();
  for (const entry of entries) {
    for (const cell of entry.cells) {
      if (seen.has(cell)) crossings.add(cell);
      seen.add(cell);
    }
  }
  return crossings;
}

function progress(objective: Objective, ctx: ObjectiveContext): [have: number, need: number] {
  switch (objective.kind) {
    case 'longWord':
      return [
        Math.max(0, ...placedTiles(ctx).map(([, t]) => t.word.length)),
        objective.letters,
      ];
    case 'greatLines':
      return [
        ctx.entries.filter((e) => ctx.tiers[e.id] === 'great' || ctx.tiers[e.id] === 'poetic')
          .length,
        objective.count,
      ];
    case 'themeWords': {
      const theme = themeSet(ctx.level.theme);
      return [placedTiles(ctx).filter(([, t]) => theme.has(t.word)).length, objective.count];
    }
    case 'swapsLeft':
      return [ctx.swapsLeft, objective.count];
    case 'rareCrossing': {
      const crossings = crossingCells(ctx.entries);
      const values = placedTiles(ctx)
        .filter(([cell]) => crossings.has(cell))
        .map(([, tile]) => tileValue(tile));
      return [Math.max(0, ...values), objective.value];
    }
  }
}

export function evaluateObjectives(ctx: ObjectiveContext): ObjectiveResult[] {
  return (ctx.level.objectives ?? []).map((objective) => {
    const [have, need] = progress(objective, ctx);
    return { objective, met: have >= need, have, need };
  });
}

/** What the objective asks for, in the owl's plain words. */
export function describeObjective(objective: Objective): string {
  switch (objective.kind) {
    case 'longWord':
      return `Use a word of ${objective.letters}+ letters`;
    case 'greatLines':
      return objective.count === 1
        ? 'Get a line judged Great or better'
        : `Get ${objective.count} lines judged Great or better`;
    case 'themeWords':
      return `Use ${objective.count} theme words`;
    case 'swapsLeft':
      return objective.count === 1
        ? 'Finish with a swap to spare'
        : `Finish with ${objective.count} swaps to spare`;
    case 'rareCrossing':
      return `Put a word worth ${objective.value}+ on a crossing`;
  }
}
