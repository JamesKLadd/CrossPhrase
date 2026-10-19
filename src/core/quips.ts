import type { Tier } from './types';

// The owl's canned lines: verdict quips for the built-in judge (the AI judges
// write their own), and what it says while you play. Picks are seeded, so the
// owl says the same thing about the same phrase every time, and nothing
// changes between re-renders. {placeholders} are filled in by fill().

export const TIER_QUIPS: Record<Tier, readonly string[]> = {
  invalid: [
    'I adjusted my glasses twice. Still nonsense.',
    'Hoo wrote this? Try again.',
    'Even my feathers are confused.',
    '“{phrase}”? My dictionary just fainted.',
    'That is word salad, and I ordered soup.',
    'Grammar called. It wants its words back.',
    'I have read cereal boxes with more sense.',
    'Bold. Wrong, but bold.',
    'Not even a newspaper headline would say that.',
    '“{phrase}”. No. Simply no.',
  ],
  ok: [
    'Grammatical. I suppose that counts for something.',
    'It parses. My standards remain unmoved.',
    'Acceptable. Barely, but acceptable.',
    'Fine. Not poetry, but fine.',
    'Adequate. I have read worse. Recently, even.',
    '“{phrase}”. Yes, that is English.',
    'Correct, the way a beige wall is correct.',
    'A perfectly serviceable phrase.',
    'I nodded. Slightly.',
    'Passable. Pass it along.',
  ],
  great: [
    'Oh, that one has a pulse.',
    'Now we are getting somewhere.',
    'I may underline that one.',
    '“{phrase}”. I see what you did there.',
    'Vivid! My ear tufts perked up.',
    'That one goes in my notebook.',
    'Clever. Do not let it go to your head.',
    'A phrase with some swagger.',
  ],
  poetic: [
    'I need a moment. That was lovely.',
    'Someone frame this immediately.',
    'My spectacles fogged up a little.',
    '“{phrase}”. I may weep into my tea.',
    'Somewhere, a poet is nervously sharpening a pencil.',
    'Pure poetry. I am writing this down.',
    'That is going on my study wall.',
  ],
};

export const OWL_LINES = {
  /** While the judge works. */
  judging: [
    'Hmm. Let me adjust my glasses…',
    'Reading carefully. Very carefully…',
    'Consulting the dictionary…',
    'One moment. I am being thorough.',
    'Hmm, hmm, hmm…',
  ],
  /** Opening line for levels without a tutorial tip. */
  intro: [
    'Fill every square. Each row and column must read as a phrase, and rarer words score more. You get {submits} submits.',
    'Another page to fill. Rows and columns must read as phrases. {submits} submits, as ever.',
    'Make every line read naturally. Rare words score more, and crossings count twice.',
    'I have sharpened my pencil. Fill the grid and let us see what you have.',
    'Every square, every line, a proper phrase. I shall be watching. {submits} submits.',
  ],
  /** Some lines failed. */
  fixLines: [
    'Not quite. Fix the lines marked ✗. {left} left.',
    'Some lines need work: look for the ✗. {left} left.',
    'Close, but a few lines are nonsense. {left} left.',
    'I have marked the offenders with ✗. {left} left.',
  ],
  /** Every line passed, but the score is short of 1 star. */
  short: [
    'All valid, but {score} is short of {need}. Rarer words, please. {left} left.',
    'Grammatical, yet {score} won’t do; I need {need}. Reach for rarer words. {left} left.',
    'Correct but plain: {score} of {need}. Spice it up. {left} left.',
  ],
  win1: [
    'Acceptable work. I expect more next time.',
    'A pass. Not a triumph, but a pass.',
    'You scraped through. I saw it.',
  ],
  win2: [
    'Good work. I am mildly impressed.',
    'Well done. My feathers are only slightly ruffled.',
    'Solid. Very solid. Almost delightful.',
  ],
  win3: [
    'Exquisite. I may frame this one.',
    'Three stars! I need to sit down.',
    'Magnificent. I am telling the other owls.',
  ],
  lose: [
    'The dictionary weeps. Shall we try again?',
    'Out of submits. Even I have off days. Not today, mind you.',
    'Hoo boy. Once more, with feeling?',
  ],
  /** Zen mode. */
  zenIntro: [
    'Zen mode. No stars, no limits. Just make every line read nicely.',
    'Take your time. Nothing is counting but me, and I am very patient.',
    'A quiet board for a quiet mind. Fill it however you like.',
  ],
  zenFix: [
    'Not quite. Fix the lines marked ✗. No rush.',
    'A few lines need another look. Take your time.',
    'Some lines wobble. Try again whenever you are ready.',
  ],
  zenWin: ['Lovely. Another?', 'Every line reads. How restful.', 'Serene. Shall we turn the page?'],
  offline: [
    "I couldn't reach the big judge, so my pocket edition graded these. I'll double-check later, and I never take back a pass.",
  ],
  /** Tapping the owl. */
  poke: ['Hoo!', 'Yes?', 'Careful, these are reading glasses.', 'I am working.', 'Hoot hoot.'],
} as const;

export type OwlLineKind = keyof typeof OWL_LINES;

function hash(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Fills {placeholders} from `vars`; unknown ones are left as they are. */
export function fill(text: string, vars: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/** The owl's quip about a phrase at a tier, the same every time for the same phrase. */
export function quipFor(tier: Tier, phrase: string): string {
  const options = TIER_QUIPS[tier];
  return fill(options[hash(`${tier}:${phrase}`) % options.length], { phrase });
}

/** A line of the given kind, picked by `seed` so it stays put across re-renders. */
export function owlLine(kind: OwlLineKind, seed: string, vars: Record<string, string | number> = {}): string {
  const options: readonly string[] = OWL_LINES[kind];
  return fill(options[hash(`${kind}:${seed}`) % options.length], vars);
}
