// Settings for the game. Edit these to change words, pictures or timing.

export const GRID_SIZE = 10;

// Directions a word may run in: 'across' (left to right), 'down' (top to bottom).
export const WORD_DIRECTIONS = ['across', 'down'];

// Everyday nouns for a young child in Singapore, 3-5 letters long.
// Words must use only the letters A-Z and be no longer than GRID_SIZE.
// Each word is shown with a picture of what it means. See CREDITS.md for sources.
export const WORDS = [
  // Getting around
  { word: 'BUS', picture: 'images/words/bus.jpg' },
  { word: 'CAR', picture: 'images/words/car.jpg' },
  { word: 'TAXI', picture: 'images/words/taxi.jpg' },
  { word: 'TRAIN', picture: 'images/words/train.jpg' },
  { word: 'PLANE', picture: 'images/words/plane.jpg' },
  { word: 'LIFT', picture: 'images/words/lift.jpg' },
  // Food
  { word: 'EGG', picture: 'images/words/egg.jpg' },
  { word: 'MILK', picture: 'images/words/milk.jpg' },
  { word: 'CAKE', picture: 'images/words/cake.jpg' },
  { word: 'RICE', picture: 'images/words/rice.jpg' },
  { word: 'APPLE', picture: 'images/words/apple.jpg' },
  { word: 'MANGO', picture: 'images/words/mango.jpg' },
  // At home
  { word: 'BED', picture: 'images/words/bed.jpg' },
  { word: 'TABLE', picture: 'images/words/table.jpg' },
  { word: 'CHAIR', picture: 'images/words/chair.jpg' },
  { word: 'FAN', picture: 'images/words/fan.jpg' },
  { word: 'CLOCK', picture: 'images/words/clock.jpg' },
  { word: 'CUP', picture: 'images/words/cup.jpg' },
  { word: 'PLATE', picture: 'images/words/plate.jpg' },
  { word: 'SPOON', picture: 'images/words/spoon.jpg' },
  { word: 'FORK', picture: 'images/words/fork.jpg' },
  { word: 'BOOK', picture: 'images/words/book.jpg' },
  { word: 'PEN', picture: 'images/words/pen.jpg' },
  { word: 'BAG', picture: 'images/words/bag.jpg' },
  { word: 'BALL', picture: 'images/words/ball.jpg' },
  // Clothes
  { word: 'SHIRT', picture: 'images/words/shirt.jpg' },
  { word: 'SOCK', picture: 'images/words/sock.jpg' },
  { word: 'SHOE', picture: 'images/words/shoe.jpg' },
  // Nature
  { word: 'CAT', picture: 'images/words/cat.jpg' },
  { word: 'DOG', picture: 'images/words/dog.jpg' },
  { word: 'BIRD', picture: 'images/words/bird.jpg' },
  { word: 'FISH', picture: 'images/words/fish.jpg' },
  { word: 'TREE', picture: 'images/words/tree.jpg' },
  { word: 'SUN', picture: 'images/words/sun.jpg' },
  { word: 'MOON', picture: 'images/words/moon.jpg' },
];

// The word is said aloud when the picture or word is tapped, and when the word is found.
// `lang` picks the built-in voice's accent; `rate` below 1 speaks more slowly;
// `pauseMs` is the pause between the word and the phrase after it.
export const SPEECH = { enabled: true, lang: 'en-US', rate: 0.8, pauseMs: 500 };

// Phrases said after the word. {word} is the word; {name} is the player's name,
// taken from the page link (e.g. ?name=Sam). Without a name, ", {name}" is left out.
export const INVITE_PHRASE = 'Can you find {word}, {name}?';
export const PRAISE_PHRASES = [
  'Well done, {name}!',
  'Good job, {name}!',
  'You found it, {name}!',
  'Great finding, {name}!',
  'Awesome, {name}!',
  'Brilliant, {name}!',
  'Super, {name}!',
  'Fantastic, {name}!',
  'Hooray! You did it, {name}!',
  'Way to go, {name}!',
  'Amazing, {name}!',
  'Great work, {name}!',
];

// Said when all the words in a game have been found (see WORDS_PER_GAME_CHOICES).
export const DONE_PHRASE = 'All done, {name}! Great job!';

// Choices for "Words per game" on the settings screen. null means the game
// goes on without end.
export const WORDS_PER_GAME_CHOICES = [null, 3, 5, 8, 10, 15, 20];

// Pictures shown after a word is found.
export const REWARD_PICTURES = Array.from({ length: 10 },
  (_, i) => `images/rewards/train-${String(i + 1).padStart(2, '0')}.jpg`);

// The found word stays highlighted while the praise is said, and at least
// this long, before the picture appears.
export const FOUND_PAUSE_MS = 1200;

// How long the picture stays on screen.
export const REWARD_MS = 4000;

// If the word has not been found this long after it appears, the word and
// the invitation are said once more as a reminder. null turns this off.
export const REMINDER_MS = 60000;
