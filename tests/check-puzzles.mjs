// Checks the puzzle generator and word shuffling. Run with: node tests/check-puzzles.mjs
import { makePuzzle, countOccurrences, ShuffleBag } from '../js/puzzle.js';
import { WORDS, GRID_SIZE, WORD_DIRECTIONS } from '../js/config.js';

const words = WORDS.map((w) => w.word);
for (const w of words) {
  if (!/^[A-Z]+$/.test(w) || w.length > GRID_SIZE) throw new Error(`Invalid word: ${w}`);
}

// Every puzzle hides its word exactly once, at the cells it reports.
const directions = { across: 0, down: 0 };
for (let i = 0; i < 20000; i++) {
  const w = words[i % words.length];
  const { grid, cells } = makePuzzle(w, GRID_SIZE, WORD_DIRECTIONS);
  if (grid.length !== GRID_SIZE || grid.some((r) => r.length !== GRID_SIZE || r.some((ch) => !/^[A-Z]$/.test(ch)))) {
    throw new Error('Bad grid');
  }
  if (cells.map(([r, c]) => grid[r][c]).join('') !== w) throw new Error(`${w} is not at its cells`);
  if (countOccurrences(grid, w, WORD_DIRECTIONS) !== 1) throw new Error(`${w} is not hidden exactly once`);
  directions[cells[0][0] === cells[1][0] ? 'across' : 'down']++;
}

// The shuffle bag uses every word before repeating, and never repeats back to back.
const bag = new ShuffleBag(words);
const seq = [];
for (let i = 0; i < words.length * 30; i++) {
  const x = bag.next();
  if (x === seq[seq.length - 1]) throw new Error('Same word twice in a row');
  seq.push(x);
}
for (let i = 0; i + words.length <= seq.length; i += words.length) {
  if (new Set(seq.slice(i, i + words.length)).size !== words.length) throw new Error('A word repeated within a shuffle');
}

console.log(`ok: ${words.length} words, 20000 puzzles`, directions);
