// Settings for the game. Edit these to change words, pictures or timing.

export const GRID_SIZE = 10;

// Directions a word may run in: 'across' (left to right), 'down' (top to bottom).
export const WORD_DIRECTIONS = ['across', 'down'];

// Words must use only the letters A-Z and be no longer than GRID_SIZE.
// Each word is shown with a picture of what it means. See CREDITS.md for sources.
export const WORDS = [
  { word: 'CAT', picture: 'images/words/cat.jpg' },
  { word: 'DOG', picture: 'images/words/dog.jpg' },
  { word: 'SUN', picture: 'images/words/sun.jpg' },
  { word: 'BUS', picture: 'images/words/bus.jpg' },
  { word: 'HAT', picture: 'images/words/hat.jpg' },
  { word: 'CAR', picture: 'images/words/car.jpg' },
  { word: 'PIG', picture: 'images/words/pig.jpg' },
  { word: 'CUP', picture: 'images/words/cup.jpg' },
  { word: 'BED', picture: 'images/words/bed.jpg' },
  { word: 'FISH', picture: 'images/words/fish.jpg' },
];

// Pictures shown after a word is found.
export const REWARD_PICTURES = Array.from({ length: 10 },
  (_, i) => `images/rewards/train-${String(i + 1).padStart(2, '0')}.jpg`);

// How long the found word stays highlighted before the picture appears.
export const FOUND_PAUSE_MS = 1200;

// How long the picture stays on screen.
export const REWARD_MS = 4000;
