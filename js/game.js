import {
  GRID_SIZE, WORD_DIRECTIONS, WORDS, SPEECH, INVITE_PHRASE, PRAISE_PHRASES,
  REWARD_PICTURES, FOUND_PAUSE_MS, REWARD_MS, REMINDER_MS,
} from './config.js';
import { makePuzzle, ShuffleBag } from './puzzle.js';
import { Speaker } from './speech.js';
import { loadRecordings } from './recordings.js';
import { openSetup } from './setup.js';

const FADE_MS = 400;
// A second tap on the same cell within this time is treated as an accidental double tap.
const REPEAT_TAP_MS = 350;
const NAME_KEY = 'playerName';
const SETUP_HOLD_MS = 1500;
// Longest the found word stays up waiting for the praise to finish.
const PRAISE_TIMEOUT_MS = 10000;
// A reminder waits until the child has not tapped for this long.
const REMINDER_IDLE_MS = 3000;

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
let foundAt = 0;
let rewardTimer = null;
let reminderTimer = null;
let lastActivityAt = 0;
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
  scheduleReminder(SPEECH.enabled ? REMINDER_MS : null);
}

// Says the word and the invitation once if the word is not found in time,
// waiting for a pause in tapping and for any speech to finish.
function scheduleReminder(delay) {
  clearTimeout(reminderTimer);
  if (delay === null) return;
  reminderTimer = setTimeout(() => {
    if (locked) return;
    const idleFor = performance.now() - lastActivityAt;
    const setupOpen = !document.getElementById('setup').hidden;
    if (idleFor < REMINDER_IDLE_MS || setupOpen || !sayWordThen({ template: INVITE_PHRASE, clip: INVITE_CLIP })) {
      scheduleReminder(Math.max(1000, REMINDER_IDLE_MS - idleFor));
    }
  }, delay);
}

function restartAnimation(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

function fillPhrase(template, theWord) {
  const text = template.replaceAll('{word}', theWord);
  return playerName ? text.replaceAll('{name}', playerName) : text.replace(/,?\s*\{name\}/g, '');
}

// Ids of recorded clips. The invitation is recorded once for all words
// ("Can you find it?"), since the word itself is said just before it.
const wordClip = (w) => `word:${w}`;
const INVITE_CLIP = 'invite';
const praiseClip = (template) => `praise:${template}`;

// Once some praise has been recorded, only recorded praise is used.
function nextPraise() {
  const recorded = PRAISE_PHRASES.filter((t) => speaker.hasClip(praiseClip(t)));
  if (recorded.length === 0) return praises.next();
  const choices = recorded.length > 1 ? recorded.filter((t) => t !== nextPraise.last) : recorded;
  nextPraise.last = choices[Math.floor(Math.random() * choices.length)];
  return nextPraise.last;
}

// Say the word followed by a phrase, e.g. "cat. Can you find cat, Sam?"
// Returns whether it is being said.
function sayWordThen(phrase, options) {
  const parts = [
    // Lower case, so short words are said as words rather than spelled out.
    { text: word.toLowerCase(), clip: wordClip(word) },
    { text: fillPhrase(phrase.template, word.toLowerCase()), clip: phrase.clip },
  ];
  if (!speaker.say(parts, options)) return false;
  restartAnimation(targetEl, 'speaking');
  return true;
}

function onRelease(event) {
  // The first tap lets later speech (the reminder) start without one.
  speaker.unlock();
  lastActivityAt = performance.now();
  if (sayOnRelease) {
    sayOnRelease = false;
    const template = nextPraise();
    const praising = sayWordThen({ template, clip: praiseClip(template) }, { interrupt: true, onDone: scheduleReward });
    if (!praising) scheduleReward();
  } else if (event.type === 'pointerup' && event.target.closest('#target')) {
    sayWordThen({ template: INVITE_PHRASE, clip: INVITE_CLIP });
  }
}

function showSetup() {
  openSetup([
    {
      title: 'Words',
      items: WORDS.map((w) => ({ id: wordClip(w.word), label: w.word.toLowerCase() })),
    },
    {
      title: 'When the picture is tapped (said after the word)',
      items: [{ id: INVITE_CLIP, label: fillPhrase(INVITE_PHRASE, 'it') }],
    },
    {
      title: 'When the word is found (said after the word)',
      items: PRAISE_PHRASES.map((t) => ({ id: praiseClip(t), label: fillPhrase(t, 'it') })),
    },
  ], speaker);
}

// Press and hold the settings button to open the grown-up screen. A quick
// tap does nothing, so it is not opened by accident.
function watchSettingsButton() {
  const button = document.getElementById('settings');
  button.style.setProperty('--hold', `${SETUP_HOLD_MS}ms`);
  let timer = null;
  const cancel = () => {
    clearTimeout(timer);
    button.classList.remove('holding');
  };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.classList.add('holding');
    timer = setTimeout(() => {
      cancel();
      showSetup();
    }, SETUP_HOLD_MS);
  });
  button.addEventListener('pointerup', cancel);
  button.addEventListener('pointercancel', cancel);
  button.addEventListener('pointerleave', cancel);
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
  foundAt = performance.now();
  clearTimeout(reminderTimer);
  for (const index of selected) gridEl.children[index].classList.add('found');
  for (const tile of lettersEl.children) tile.classList.add('found');
  // Normally the praise finishing brings the picture; this is in case it doesn't.
  clearTimeout(rewardTimer);
  rewardTimer = setTimeout(showReward, SPEECH.enabled ? PRAISE_TIMEOUT_MS : FOUND_PAUSE_MS);
}

// Shows the picture once the found word has been up for at least FOUND_PAUSE_MS.
function scheduleReward() {
  clearTimeout(rewardTimer);
  rewardTimer = setTimeout(showReward, Math.max(0, FOUND_PAUSE_MS - (performance.now() - foundAt)));
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

// Load all pictures up front, so each is ready when needed and saved for
// playing offline (see sw.js).
for (const { picture } of WORDS) if (picture) new Image().src = picture;
for (const picture of REWARD_PICTURES) new Image().src = picture;

async function loadVoiceRecordings() {
  try {
    const recordings = await loadRecordings();
    await Promise.all([...recordings].map(async ([id, recording]) => {
      try {
        if (recording.pcm) {
          const pcm = new Int16Array(recording.pcm);
          speaker.setClipFromSamples(id, Float32Array.from(pcm, (s) => s / 0x7fff), recording.sampleRate);
        } else {
          await speaker.setClipFromFile(id, recording.data);
        }
      } catch {
        // An unreadable recording is skipped; the built-in voice says that phrase.
      }
    }));
  } catch {
    // Without stored recordings the built-in voice is used.
  }
}

// Keeps the game up to date and playable offline (see sw.js).
navigator.serviceWorker?.register('sw.js').catch(() => {});

watchSettingsButton();
loadVoiceRecordings().then(() => {
  if (new URLSearchParams(window.location.search).has('setup')) showSetup();
});

fitToScreen();
startRound();
