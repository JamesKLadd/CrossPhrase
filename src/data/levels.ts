import type { LevelDef } from '../core/types';
import generated from './levels.generated.json';
import { TUTORIAL } from './tutorial';

// Levels 1-10 are the scripted tutorial; the rest are made by the procedural
// generator (`npm run generate:levels`, see src/core/levelGen.ts).

// The JSON is checked level by level in src/core/__tests__/content.test.ts.
export const LEVELS: LevelDef[] = [...TUTORIAL, ...(generated.levels as unknown as LevelDef[])];

export const LEVEL_IDS = LEVELS.map((level) => level.id);

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((level) => level.id === id);
}

/** 1-based position on the level map. */
export function levelNumber(id: string): number {
  return LEVELS.findIndex((level) => level.id === id) + 1;
}
