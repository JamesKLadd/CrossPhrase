import type { LevelDef } from '../core/types';

// Hand-authored prototype levels. Phase 3 replaces these with the procedural
// generator, keeping a few scripted tutorial levels up front.

export const LEVELS: LevelDef[] = [
  {
    id: 'first-light',
    name: 'First Light',
    theme: 'breakfast',
    layout: [
      '...',
      '.##',
      '.##',
    ],
    hints: { '0,0': 'det' },
    swaps: 5,
    seed: 101,
  },
  {
    id: 'second-helping',
    name: 'Second Helping',
    theme: 'breakfast',
    layout: [
      '....',
      '.##.',
    ],
    anchors: { '0,0': 'my' },
    swaps: 5,
    seed: 202,
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    theme: 'night-sky',
    layout: [
      '...',
      '.#.',
      '...',
    ],
    anchors: { '1,0': 'the' },
    hints: { '2,2': 'noun' },
    swaps: 5,
    seed: 303,
  },
  {
    id: 'moon-garden',
    name: 'Moon Garden',
    theme: 'garden',
    layout: [
      '....',
      '.#..',
      '....',
    ],
    hints: { '0,0': 'det', '2,3': 'noun' },
    swaps: 4,
    seed: 404,
  },
  {
    id: 'seed-packet',
    name: 'Seed Packet',
    theme: 'garden',
    layout: [
      '...#',
      '.#..',
      '....',
      '#...',
    ],
    anchors: { '2,0': 'the' },
    hints: { '0,2': 'noun', '3,3': 'verb' },
    swaps: 4,
    seed: 505,
  },
  {
    id: 'compost-heap',
    name: 'Compost Heap',
    theme: 'garden',
    layout: [
      '..#..',
      '.....',
      '..#..',
    ],
    hints: { '1,2': 'verb' },
    swaps: 4,
    seed: 606,
  },
  {
    id: 'starry-starry',
    name: 'Starry, Starry',
    theme: 'night-sky',
    layout: [
      '..#..',
      '.....',
      '#...#',
      '.....',
      '..#..',
    ],
    anchors: { '2,2': 'and' },
    swaps: 4,
    seed: 707,
  },
  {
    id: 'full-english',
    name: 'Full English',
    theme: 'breakfast',
    layout: [
      '.....',
      '.#.#.',
      '.....',
      '.#.#.',
      '.....',
    ],
    hints: { '0,0': 'det', '2,2': 'verb', '4,4': 'noun' },
    swaps: 3,
    seed: 808,
  },
];

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((level) => level.id === id);
}
