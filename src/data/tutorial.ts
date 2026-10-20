import type { LevelDef } from '../core/types';

// The scripted tutorial: levels 1-10. Each one teaches one idea, and its deck
// deals a hand that can solve it (random draws take over once a deck runs
// out). Star thresholds are set so the fill the deck is built around earns 2★.
// Everything after level 10 comes from the generator.

export const TUTORIAL: LevelDef[] = (
  [
  {
    // the golden toast melts / the sleepy chef yawns
    id: 'first-light',
    name: 'First Light',
    theme: 'breakfast',
    layout: [
      '....',
      '.###',
      '.###',
      '.###',
    ],
    swaps: 5,
    stars: [23, 34, 50],
    seed: 101,
    deck: ['the', 'golden', 'toast', 'melts', 'sleepy', 'chef', 'yawns', 'hot', 'tea', 'muffin', 'fresh', 'jam'],
    intro:
      'Welcome! Drag a word onto each square. The row and the column must each read as a phrase, and they share the corner.',
  },
  {
    // the hot kettle sings / the chef pours coffee / sings to the chef
    id: 'second-helping',
    name: 'Second Helping',
    theme: 'breakfast',
    layout: [
      '....',
      '.##.',
      '.##.',
      '.##.',
    ],
    swaps: 5,
    stars: [26, 38, 56],
    seed: 202,
    deck: [
      'the', 'hot', 'kettle', 'sings', 'chef', 'pours', 'coffee',
      'to', 'the', 'chef', 'jam', 'my', 'pancake', 'slowly', 'golden', 'tea',
    ],
    intro:
      'Two crossings now. A word where lines cross has to work both ways, and it scores in both lines.',
  },
  {
    // the moon glows softly / moon drifts very slowly
    id: 'night-owl',
    name: 'Night Owl',
    theme: 'night-sky',
    layout: [
      '....',
      '#.##',
      '#.##',
      '#.##',
    ],
    anchors: { '0,1': 'moon' },
    swaps: 5,
    stars: [21, 30, 45],
    seed: 303,
    deck: ['the', 'glows', 'softly', 'drifts', 'very', 'slowly', 'silver', 'owl', 'pale', 'comet', 'we', 'whispers'],
    intro: 'Some squares come filled in. Anchored words are locked, so build around them.',
  },
  {
    // the silver comet glows / comet drifts very slowly
    id: 'swap-meet',
    name: 'Swap Meet',
    theme: 'night-sky',
    layout: [
      '....',
      '##.#',
      '##.#',
      '##.#',
    ],
    swaps: 5,
    stars: [19, 32, 48],
    seed: 404,
    deck: [
      'of', 'but', 'or', 'the', 'and', 'to', 'very',
      'silver', 'comet', 'glows', 'drifts', 'slowly', 'night', 'owl', 'blinks', 'wolf', 'howls', 'lunar',
    ],
    intro:
      "That hand is nearly all glue. Tap a word you don't want, then Swap it for a new one. Swaps are limited, so choose well.",
  },
  {
    // the busy bee buzzes / a busy garden blooms
    id: 'busy-bee',
    name: 'Busy Bee',
    theme: 'garden',
    layout: [
      '#.##',
      '....',
      '#.##',
      '#.##',
    ],
    swaps: 5,
    stars: [20, 29, 42],
    seed: 505,
    deck: ['the', 'busy', 'bee', 'buzzes', 'a', 'garden', 'blooms', 'green', 'frog', 'hops', 'sun', 'shines'],
    intro:
      'I grade every line: OK, Great or Poetic. A Great line scores one and a half times its words, a Poetic one double.',
  },
  {
    // the fragrant tulip blooms / a tiny tulip wilts
    id: 'tulip-time',
    name: 'Tulip Time',
    theme: 'garden',
    layout: [
      '##.#',
      '##.#',
      '....',
      '##.#',
    ],
    swaps: 5,
    stars: [26, 38, 56],
    seed: 606,
    deck: ['the', 'fragrant', 'tulip', 'blooms', 'a', 'tiny', 'wilts', 'rose', 'garden', 'my', 'sprout', 'muddy'],
    intro:
      "See the number on each tile? That's its rarity: rarer words score more. The crossing square is in both lines, so it counts twice.",
  },
  {
    // we love the sea / sea and sand sparkle / the shiny shell sparkle (shells)
    id: 'making-waves',
    name: 'Making Waves',
    theme: 'seaside',
    layout: [
      '.##.',
      '.##.',
      '.##.',
      '....',
    ],
    hints: { '0,0': 'pron', '1,0': 'verb', '3,1': 'conj', '1,3': 'adj', '3,3': 'verb' },
    swaps: 5,
    stars: [27, 40, 59],
    seed: 707,
    deck: [
      'we', 'love', 'the', 'sea', 'and', 'sand', 'sparkle',
      'the', 'shiny', 'shell', 'calm', 'boat', 'sail', 'sandy', 'beach', 'often',
    ],
    intro:
      "Labels like n. (noun) and adj. (adjective) suggest what might fit. They're only hints: ignore them whenever you like. And any noun can be read as plural.",
  },
  {
    // the old lighthouse shines / the brave captain sails
    id: 'wild-tide',
    name: 'Wild Tide',
    theme: 'seaside',
    layout: [
      '....',
      '.###',
      '.###',
      '.###',
    ],
    swaps: 5,
    stars: [19, 28, 41],
    seed: 808,
    deck: ['*', 'the', 'old', 'lighthouse', 'shines', 'brave', 'captain', 'sails', 'pirate', 'sandy', 'crab', 'dives', 'island'],
    intro:
      "A ★ wildcard can be any word in my dictionary. Drop it on a square and pick one. It scores half that word's value.",
  },
  {
    // the wise owl reads / the dusty book waits / reads to the poet
    id: 'quiet-please',
    name: 'Quiet, Please',
    theme: 'library',
    layout: [
      '....',
      '.##.',
      '.##.',
      '.##.',
    ],
    swaps: 5,
    stars: [23, 33, 49],
    seed: 909,
    deck: [
      'the', 'wise', 'owl', 'reads', 'dusty', 'book', 'waits',
      'to', 'the', 'poet', 'library', 'candle', 'a', 'poem', 'ink',
    ],
    objectives: [{ kind: 'themeWords', count: 3, points: 6 }],
    intro:
      'This level has a bonus goal. Goals are optional, but they add points. Theme words are the ones that fit the level, here the library.',
  },
  {
    // my old dusty book / my wise old librarian / book with a secret / librarian whispers a secret
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
  ] satisfies LevelDef[]
  // Balanced hands (see drawTile) once a level's scripted deck runs out.
).map((level): LevelDef => ({ ...level, draw: 2 }));
