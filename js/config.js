// Settings for the game. Edit these to change words, pictures or timing.

export const GRID_SIZE = 10;

// Directions a word may run in: 'across' (left to right), 'down' (top to bottom).
export const WORD_DIRECTIONS = ['across', 'down'];

// Words must use only the letters A-Z and be no longer than GRID_SIZE.
export const WORDS = ['CAT', 'DOG', 'SUN', 'BUS', 'HAT', 'CAR', 'PIG', 'CUP', 'BED', 'FISH'];

// Pictures shown after a word is found. See CREDITS.md for sources.
export const REWARD_PICTURES = Array.from({ length: 10 },
  (_, i) => `images/rewards/train-${String(i + 1).padStart(2, '0')}.jpg`);

// How long the found word stays highlighted before the picture appears.
export const FOUND_PAUSE_MS = 1200;

// How long the picture stays on screen.
export const REWARD_MS = 4000;
