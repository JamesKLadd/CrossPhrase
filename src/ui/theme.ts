import type { Pos, Tier } from '../core/types';

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
