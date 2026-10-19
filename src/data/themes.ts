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
};
