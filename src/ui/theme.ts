import type { Pos, Tier } from '../core/types';
import { useSettings } from '../settings';

// Placeholder palette: warm paper and ink, to suit a bookish owl. Phase 4
// replaces this with the real art direction.
export const colors = {
  paper: '#F5EEDC',
  paperDeep: '#EADFC6',
  ink: '#2F2A24',
  inkSoft: '#6B6257',
  wood: '#8B6B4A',
  tile: '#FFFDF7',
  tileEdge: '#D9CBAE',
  blocked: '#3B342C',
  cell: '#FBF7EE',
  anchor: '#E4D8BF',
  selected: '#E9A23B',
  wildcard: '#FFF4DC',
  star: '#E9A23B',
  starEmpty: '#D9CBAE',
  white: '#FFFFFF',
  tier: {
    invalid: '#C9473F',
    ok: '#4F7FB0',
    great: '#3F8F5C',
    poetic: '#8A55B5',
  } satisfies Record<Tier, string>,
};

/**
 * Verdict colours. The colour-blind set (from the Okabe–Ito palette, darkened
 * so white text stays readable) keeps the four tiers apart for the common
 * kinds of colour blindness. Either way, verdicts also carry an icon and a
 * label, so colour is never the only cue.
 */
export const TIER_PALETTES: Record<'standard' | 'colorBlind', Record<Tier, string>> = {
  standard: colors.tier,
  colorBlind: {
    invalid: '#C25200',
    ok: '#0072B2',
    great: '#007A5A',
    poetic: '#A35488',
  },
};

/** The verdict colours for the player's settings. */
export function useTierColors(): Record<Tier, string> {
  return TIER_PALETTES[useSettings().colorBlind ? 'colorBlind' : 'standard'];
}

export const TIER_ICON: Record<Tier, string> = {
  invalid: '✗',
  ok: '✓',
  great: '★',
  poetic: '✦',
};

export const TIER_LABEL: Record<Tier, string> = {
  invalid: 'Nope',
  ok: 'OK',
  great: 'Great',
  poetic: 'Poetic',
};

/** Dictionary-style abbreviations, shown as soft hints on cells. */
export const POS_LABEL: Record<Pos, string> = {
  noun: 'n.',
  verb: 'v.',
  adj: 'adj.',
  adv: 'adv.',
  det: 'det.',
  pron: 'pron.',
  prep: 'prep.',
  conj: 'conj.',
  interj: 'interj.',
};

/** Picks a font size so a word fits on a tile of the given width. */
export function wordFontSize(word: string, width: number): number {
  return Math.min(width * 0.3, (width - 8) / (0.6 * Math.max(word.length, 1)));
}
