import {
  GRID_SIZE, WORD_DIRECTIONS, WORDS, SPEECH, INVITE_PHRASE, PRAISE_PHRASES,
  REWARD_PICTURES, FOUND_PAUSE_MS, REWARD_MS,
} from './config.js';
import { makePuzzle, ShuffleBag } from './puzzle.js';
import { Speaker } from './speech.js';

const FADE_MS = 400;
// A second tap on the same cell within this time is treated as an accidental double tap.
const REPEAT_TAP_MS = 350;
const NAME_KEY = 'playerName';

const targetEl = document.getElementById('target');
const wordPictureEl = document.getElementById('word-picture');
const wordImg = document.getElementById('word-img');
const lettersEl = document.getElementById('word-letters');
const gridEl = document.getElementById('grid');
const rewardEl = document.getElementById('reward');
const rewardImg = document.getElementById('reward-img');
const rewardBar = document.getElementById('reward-bar');

const words = new ShuffleBag(WORDS);
const pictures = new ShuffleBag(REWARD_PICTURES);
const praises = new ShuffleBag(PRAISE_PHRASES);
const speaker = new Speaker(SPEECH);
const playerName = readPlayerName();

let entry = null; // current item from WORDS
let word = '';
let wordIndexOfCell = new Map(); // cell index -> position in word
let selected = new Set(); // cell indices
let locked = false;
let nextPicture = null;
let sayOnRelease = false; // praise when the finger that found the word lifts
const lastTapAt = new Map();

// The name comes from the page link (?name=Sam), so it is not stored in the code.
// It is remembered on the device in case the page is later opened without it,
// and `?name=` with nothing after it forgets it.
function readPlayerName() {
  const param = new URLSearchParams(window.location.search).get('name');
  const name = (param ?? '').replace(/[^\p{L}\p{M}' -]/gu, '').trim().slice(0, 30);
  try {
    if (param === null) return localStorage.getItem(NAME_KEY) ?? '';
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    // Storage can be unavailable (e.g. private browsing); the link still works.
  }
  return name;
}

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
  entry = words.next();
  word = entry.word;
  const { grid, cells } = makePuzzle(word, GRID_SIZE, WORD_DIRECTIONS);
  wordIndexOfCell = new Map(cells.map(([r, c], k) => [r * GRID_SIZE + c, k]));
  selected = new Set();
  lastTapAt.clear();

  wordPictureEl.hidden = !entry.picture;
  if (entry.picture) wordImg.src = entry.picture;
  lettersEl.replaceChildren(...[...word].map((letter) => makeTile(letter, 'tile')));
  lettersEl.setAttribute('aria-label', `Find ${word}`);

  gridEl.replaceChildren(...grid.flat().map((letter, i) => {
    const cell = makeTile(letter, 'cell');
    cell.dataset.index = i;
    return cell;
  }));

  preloadNextPicture();
  locked = false;
}

function restartAnimation(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

function fillPhrase(template) {
  // With a recording of the word, avoid mixing the built-in voice saying it too.
  const text = template.replaceAll('{word}', entry.sound ? 'it' : word.toLowerCase());
  return playerName ? text.replaceAll('{name}', playerName) : text.replace(/,?\s*\{name\}/g, '');
}

// Say the word followed by a phrase, e.g. "cat. Can you find cat, Sam?"
function sayWordThen(template, options) {
  // Lower case, so short words are said as words rather than spelled out.
  const parts = [{ text: word.toLowerCase(), recording: entry.sound }, { text: fillPhrase(template) }];
  if (speaker.say(parts, options)) restartAnimation(targetEl, 'speaking');
}

function onRelease(event) {
  if (sayOnRelease) {
    sayOnRelease = false;
    sayWordThen(praises.next(), { interrupt: true });
  } else if (event.type === 'pointerup' && event.target.closest('#target')) {
    sayWordThen(INVITE_PHRASE);
  }
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
    restartAnimation(cell, 'nope');
    return;
  }

  const tile = lettersEl.children[wordIndexOfCell.get(index)];
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
  sayOnRelease = true;
  for (const index of selected) gridEl.children[index].classList.add('found');
  for (const tile of lettersEl.children) tile.classList.add('found');
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

// Size the grid, word and picture so they fill the screen without scrolling.
// All sizes are multiples of one grid cell.
function fitToScreen() {
  const pad = 16;
  const gap = 24;
  const tileScale = 1.15; // word letters are a little bigger than grid letters
  const pictureAspect = 1.7; // widest picture shape; wider ones are trimmed at the sides
  const minPictureHeight = 1.5;
  const maxPictureHeight = 3; // the picture grows into spare space up to this
  const pictureGap = 0.4;
  const width = window.innerWidth - 2 * pad;
  const height = window.innerHeight - 2 * pad - gap;
  const longest = Math.max(...WORDS.map((w) => w.word.length));
  const lettersWidth = longest * tileScale * 1.1;
  const cell = Math.floor(Math.min(
    width / GRID_SIZE,
    height / (GRID_SIZE + minPictureHeight),
    width / (minPictureHeight * pictureAspect + pictureGap + lettersWidth),
  ));
  const pictureHeight = Math.min(
    maxPictureHeight * cell,
    height - GRID_SIZE * cell,
    (width - (pictureGap + lettersWidth) * cell) / pictureAspect,
  );
  const style = document.documentElement.style;
  style.setProperty('--size', GRID_SIZE);
  style.setProperty('--cell', `${cell}px`);
  style.setProperty('--tile', `${Math.floor(cell * tileScale)}px`);
  style.setProperty('--picture-w', `${Math.floor(pictureHeight * pictureAspect)}px`);
  style.setProperty('--picture-h', `${Math.floor(pictureHeight)}px`);
  style.setProperty('--picture-gap', `${Math.floor(cell * pictureGap)}px`);
}

gridEl.addEventListener('pointerdown', onTap);
document.addEventListener('pointerup', onRelease);
document.addEventListener('pointercancel', onRelease);
// Stop long-press menus and pinch zoom from getting in the way.
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('resize', fitToScreen);

// Word pictures and recordings are small, so load them all up front to have
// each ready when its word comes up.
for (const { picture, sound } of WORDS) {
  if (picture) new Image().src = picture;
  speaker.preload(sound);
}

fitToScreen();
startRound();
