export interface Theme {
  /** Matches a word pool in words.json (a file in scripts/words/). */
  id: string;
  name: string;
  emoji: string;
}

export const THEMES: Record<string, Theme> = {
  breakfast: { id: 'breakfast', name: 'Breakfast', emoji: '🥞' },
  'night-sky': { id: 'night-sky', name: 'Night Sky', emoji: '🌙' },
  garden: { id: 'garden', name: 'Garden', emoji: '🌷' },
  seaside: { id: 'seaside', name: 'Seaside', emoji: '🌊' },
  library: { id: 'library', name: 'Library', emoji: '📚' },
};

/** The order chapters of generated levels cycle through, ten levels per theme. */
export const THEME_ORDER = ['breakfast', 'night-sky', 'garden', 'seaside', 'library'];
