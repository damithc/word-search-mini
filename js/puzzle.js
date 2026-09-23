// Builds a word-search grid that hides one word exactly once.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Direction name -> [row step, column step]
export const DIRECTIONS = {
  across: [0, 1],
  down: [1, 0],
};

function randomInt(n, random) {
  return Math.floor(random() * n);
}

function randomLetter(random) {
  return ALPHABET[randomInt(ALPHABET.length, random)];
}

// Counts how many times `word` reads forwards along any allowed direction.
export function countOccurrences(grid, word, directionNames) {
  const size = grid.length;
  let count = 0;
  for (const name of directionNames) {
    const [dr, dc] = DIRECTIONS[name];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        let k = 0;
        while (k < word.length) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (rr >= size || cc >= size || grid[rr][cc] !== word[k]) break;
          k++;
        }
        if (k === word.length) count++;
      }
    }
  }
  return count;
}

// Returns { grid, cells } where grid is a size x size array of letters and
// cells lists the [row, col] of each letter of the word, in order.
export function makePuzzle(word, size, directionNames, random = Math.random) {
  if (word.length > size) throw new Error(`"${word}" does not fit in a ${size}x${size} grid`);

  const name = directionNames[randomInt(directionNames.length, random)];
  const [dr, dc] = DIRECTIONS[name];
  const maxRow = size - 1 - dr * (word.length - 1);
  const maxCol = size - 1 - dc * (word.length - 1);
  const startRow = randomInt(maxRow + 1, random);
  const startCol = randomInt(maxCol + 1, random);
  const cells = [...word].map((_, k) => [startRow + dr * k, startCol + dc * k]);

  for (let attempt = 0; attempt < 1000; attempt++) {
    const grid = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => randomLetter(random)));
    cells.forEach(([r, c], k) => { grid[r][c] = word[k]; });
    if (countOccurrences(grid, word, directionNames) === 1) return { grid, cells };
  }
  throw new Error(`Could not hide "${word}" exactly once`);
}

// Hands out items in random order, using each once before any repeats,
// and never giving the same item twice in a row.
export class ShuffleBag {
  constructor(items, random = Math.random) {
    this.items = [...items];
    this.random = random;
    this.queue = [];
    this.last = undefined;
  }

  next() {
    if (this.queue.length === 0) {
      this.queue = [...this.items];
      for (let i = this.queue.length - 1; i > 0; i--) {
        const j = randomInt(i + 1, this.random);
        [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
      }
      if (this.queue.length > 1 && this.queue[this.queue.length - 1] === this.last) {
        [this.queue[0], this.queue[this.queue.length - 1]] =
          [this.queue[this.queue.length - 1], this.queue[0]];
      }
    }
    this.last = this.queue.pop();
    return this.last;
  }
}
