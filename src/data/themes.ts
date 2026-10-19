export interface Theme {
  /** Matches a word pool in words.json (a file in scripts/words/). */
  id: string;
  name: string;
  emoji: string;
  /** A soft background colour for the theme's chapter on the map and its levels. */
  tint: string;
}

export const THEMES: Record<string, Theme> = {
  breakfast: { id: 'breakfast', name: 'Breakfast', emoji: '🥞', tint: '#F7E3C6' },
  'night-sky': { id: 'night-sky', name: 'Night Sky', emoji: '🌙', tint: '#DEE3F1' },
  garden: { id: 'garden', name: 'Garden', emoji: '🌷', tint: '#E0ECD6' },
  seaside: { id: 'seaside', name: 'Seaside', emoji: '🌊', tint: '#D8EAEF' },
  library: { id: 'library', name: 'Library', emoji: '📚', tint: '#EBDDCB' },
};

/** The order chapters of generated levels cycle through, ten levels per theme. */
export const THEME_ORDER = ['breakfast', 'night-sky', 'garden', 'seaside', 'library'];
