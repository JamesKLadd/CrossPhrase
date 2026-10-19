import type { LevelDef } from '../core/types';

// The scripted tutorial: levels 1-10. Each one teaches one idea, and its deck
// deals a hand that can solve it (random draws take over once a deck runs
// out). Star thresholds are set so the fill the deck is built around earns 2★.
// Everything after level 10 comes from the generator.

export const TUTORIAL: LevelDef[] = [
  {
    id: 'first-light',
    name: 'First Light',
    theme: 'breakfast',
    layout: [
      '...',
      '.##',
    ],
    swaps: 5,
    stars: [11, 16, 24],
    seed: 101,
    deck: ['the', 'golden', 'toast', 'chef', 'sleepy', 'hot', 'tea', 'muffin', 'fresh', 'a', 'jam'],
    intro:
      'Welcome! Drag a word onto each square. The row and the column must each read as a phrase, and they share the corner.',
  },
  {
    id: 'second-helping',
    name: 'Second Helping',
    theme: 'breakfast',
    layout: [
      '...',
      '.#.',
    ],
    swaps: 5,
    stars: [19, 28, 41],
    seed: 202,
    deck: ['the', 'chef', 'stirs', 'kettle', 'slowly', 'hot', 'jam', 'my', 'pancake', 'gently', 'sips'],
    intro:
      'Two crossings now. A word where lines cross has to work both ways, and it scores in both lines.',
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    theme: 'night-sky',
    layout: [
      '...',
      '#.#',
      '#.#',
    ],
    anchors: { '0,1': 'moon' },
    swaps: 5,
    stars: [16, 24, 35],
    seed: 303,
    deck: ['the', 'glows', 'drifts', 'slowly', 'silver', 'owl', 'softly', 'pale', 'comet', 'we', 'whispers'],
    intro: 'Some squares come filled in. Anchored words are locked, so build around them.',
  },
  {
    id: 'swap-meet',
    name: 'Swap Meet',
    theme: 'night-sky',
    layout: [
      '...',
      '#.#',
    ],
    swaps: 5,
    stars: [13, 24, 35],
    seed: 404,
    deck: [
      'of', 'but', 'or', 'the', 'and', 'to', 'very',
      'comet', 'glows', 'drifts', 'silver', 'night', 'owl', 'blinks', 'wolf', 'howls', 'lunar', 'sky',
    ],
    intro:
      "That hand is all glue. Tap a word you don't want, then Swap it for a new one. Swaps are limited, so choose well.",
  },
  {
    id: 'busy-bee',
    name: 'Busy Bee',
    theme: 'garden',
    layout: [
      '...',
      '.#.',
      '...',
    ],
    swaps: 5,
    stars: [32, 47, 69],
    seed: 505,
    deck: [
      'the', 'busy', 'bee', 'gentle', 'rain', 'buzzes', 'softly',
      'falls', 'green', 'frog', 'hops', 'sun', 'a', 'shines',
    ],
    intro:
      'I grade every line: OK, Great or Poetic. A Great line scores one and a half times its words, a Poetic one double.',
  },
  {
    id: 'tulip-time',
    name: 'Tulip Time',
    theme: 'garden',
    layout: [
      '#.#',
      '...',
      '#.#',
    ],
    swaps: 5,
    stars: [19, 28, 41],
    seed: 606,
    deck: ['the', 'tulip', 'blooms', 'a', 'wilts', 'fragrant', 'rose', 'garden', 'my', 'sprout', 'muddy'],
    intro:
      "See the number on each tile? That's its rarity: rarer words score more. The middle square is in both lines, so it counts twice.",
  },
  {
    id: 'making-waves',
    name: 'Making Waves',
    theme: 'seaside',
    layout: [
      '.#.',
      '...',
      '.#.',
    ],
    hints: { '0,0': 'det', '2,0': 'noun', '1,1': 'noun', '2,2': 'adv' },
    swaps: 5,
    stars: [20, 29, 43],
    seed: 707,
    deck: ['the', 'blue', 'sea', 'wave', 'crash', 'gently', 'calm', 'boat', 'sail', 'sandy', 'beach', 'often'],
    intro:
      "Labels like n. (noun) and adv. (adverb) suggest what might fit. They're only hints: ignore them whenever you like.",
  },
  {
    id: 'wild-tide',
    name: 'Wild Tide',
    theme: 'seaside',
    layout: [
      '....',
      '.###',
      '.###',
    ],
    swaps: 5,
    stars: [16, 23, 34],
    seed: 808,
    deck: ['*', 'the', 'old', 'lighthouse', 'shines', 'captain', 'sails', 'pirate', 'sandy', 'crab', 'dives', 'island'],
    intro:
      "A ★ wildcard can be any word in my dictionary. Drop it on a square and pick one. It scores half that word's value.",
  },
  {
    id: 'quiet-please',
    name: 'Quiet, Please',
    theme: 'library',
    layout: [
      '...',
      '.#.',
      '.#.',
    ],
    swaps: 5,
    stars: [21, 31, 46],
    seed: 909,
    deck: ['the', 'wise', 'owl', 'dusty', 'book', 'reads', 'slowly', 'library', 'candle', 'a', 'poem', 'ink'],
    objectives: [{ kind: 'themeWords', count: 3, points: 6 }],
    intro:
      'This level has a bonus goal. Goals are optional, but they add points. Theme words are the ones that fit the level, here the library.',
  },
  {
    id: 'final-chapter',
    name: 'Final Chapter',
    theme: 'library',
    layout: [
      '....',
      '.##.',
      '.##.',
      '....',
    ],
    swaps: 5,
    stars: [33, 48, 71],
    seed: 1010,
    deck: [
      'my', 'old', 'dusty', 'book', 'wise', 'librarian', 'with',
      'a', 'secret', 'whispers', 'old', 'a', 'candle', 'tale', 'ink', 'the', 'story',
    ],
    objectives: [{ kind: 'longWord', letters: 9, points: 10 }],
    intro: 'Final exam: four lines, four crossings, three submits. Make me proud.',
  },
];
