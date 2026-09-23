import {
  GRID_SIZE, WORD_DIRECTIONS, WORDS, REWARD_PICTURES, FOUND_PAUSE_MS, REWARD_MS,
} from './config.js';
import { makePuzzle, ShuffleBag } from './puzzle.js';

const FADE_MS = 400;
// A second tap on the same cell within this time is treated as an accidental double tap.
const REPEAT_TAP_MS = 350;

const targetEl = document.getElementById('target');
const gridEl = document.getElementById('grid');
const rewardEl = document.getElementById('reward');
const rewardImg = document.getElementById('reward-img');
const rewardBar = document.getElementById('reward-bar');

const words = new ShuffleBag(WORDS);
const pictures = new ShuffleBag(REWARD_PICTURES);

let word = '';
let wordIndexOfCell = new Map(); // cell index -> position in word
let selected = new Set(); // cell indices
let locked = false;
let nextPicture = null;
const lastTapAt = new Map();

function preloadNextPicture() {
  nextPicture = pictures.next();
  new Image().src = nextPicture;
}

function makeTile(letter, className) {
  const el = document.createElement('div');
  el.className = className;
  const face = document.createElement('span');
  face.className = 'face';
  face.textContent = letter;
  el.append(face);
  return el;
}

function startRound() {
  word = words.next();
  const { grid, cells } = makePuzzle(word, GRID_SIZE, WORD_DIRECTIONS);
  wordIndexOfCell = new Map(cells.map(([r, c], k) => [r * GRID_SIZE + c, k]));
  selected = new Set();
  lastTapAt.clear();

  targetEl.replaceChildren(...[...word].map((letter) => makeTile(letter, 'tile')));
  targetEl.setAttribute('aria-label', `Find ${word}`);

  gridEl.replaceChildren(...grid.flat().map((letter, i) => {
    const cell = makeTile(letter, 'cell');
    cell.dataset.index = i;
    return cell;
  }));

  preloadNextPicture();
  locked = false;
}

function wiggle(cell) {
  cell.classList.remove('nope');
  void cell.offsetWidth; // restart the animation
  cell.classList.add('nope');
}

function onTap(event) {
  const cell = event.target.closest('.cell');
  if (!cell || locked) return;
  event.preventDefault();

  const index = Number(cell.dataset.index);
  const now = performance.now();
  if (now - (lastTapAt.get(index) ?? -Infinity) < REPEAT_TAP_MS) return;
  lastTapAt.set(index, now);

  if (!wordIndexOfCell.has(index)) {
    wiggle(cell);
    return;
  }

  const tile = targetEl.children[wordIndexOfCell.get(index)];
  if (selected.has(index)) {
    selected.delete(index);
    cell.classList.remove('selected');
    tile.classList.remove('selected');
  } else {
    selected.add(index);
    cell.classList.add('selected');
    tile.classList.add('selected');
  }

  if (selected.size === word.length) celebrate();
}

function celebrate() {
  locked = true;
  for (const index of selected) gridEl.children[index].classList.add('found');
  for (const tile of targetEl.children) tile.classList.add('found');
  setTimeout(showReward, FOUND_PAUSE_MS);
}

function showReward() {
  rewardImg.src = nextPicture;
  rewardBar.style.animationDuration = `${REWARD_MS}ms`;
  rewardEl.classList.remove('filling');
  rewardEl.hidden = false;
  void rewardEl.offsetWidth; // let the fade-in and bar animations start from the beginning
  rewardEl.classList.add('visible', 'filling');

  setTimeout(() => {
    startRound();
    rewardEl.classList.remove('visible');
    setTimeout(() => { rewardEl.hidden = true; }, FADE_MS);
  }, FADE_MS + REWARD_MS);
}

// Size the grid and word so they fill the screen without scrolling.
function fitToScreen() {
  const pad = 16;
  const gap = 24;
  const tileScale = 1.15; // word letters are a little bigger than grid letters
  const width = window.innerWidth - 2 * pad;
  const height = window.innerHeight - 2 * pad - gap;
  const longest = Math.max(...WORDS.map((w) => w.length));
  const cell = Math.floor(Math.min(
    width / GRID_SIZE,
    height / (GRID_SIZE + tileScale),
    width / (longest * tileScale * 1.1),
  ));
  document.documentElement.style.setProperty('--size', GRID_SIZE);
  document.documentElement.style.setProperty('--cell', `${cell}px`);
  document.documentElement.style.setProperty('--tile', `${Math.floor(cell * tileScale)}px`);
}

gridEl.addEventListener('pointerdown', onTap);
// Stop long-press menus and pinch zoom from getting in the way.
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('resize', fitToScreen);

fitToScreen();
startRound();
