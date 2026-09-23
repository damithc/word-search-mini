import {
  GRID_SIZE, WORD_DIRECTIONS, WORDS, SPEECH, INVITE_PHRASE, PRAISE_PHRASES, DONE_PHRASE,
  WORDS_PER_GAME_CHOICES, REWARD_PICTURES, FOUND_PAUSE_MS, REWARD_MS, REMINDER_MS,
} from './config.js';
import { makePuzzle, ShuffleBag } from './puzzle.js';
import { Speaker } from './speech.js';
import { loadRecordings } from './recordings.js';
import { openSetup } from './setup.js';

const FADE_MS = 400;
// A second tap on the same cell within this time is treated as an accidental double tap.
const REPEAT_TAP_MS = 350;
const NAME_KEY = 'playerName';
const LINK_NAME_KEY = 'playerNameFromLink';
const WORDS_PER_GAME_KEY = 'wordsPerGame';
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
const progressEl = document.getElementById('progress');
const doneEl = document.getElementById('done');

const words = new ShuffleBag(WORDS);
const pictures = new ShuffleBag(REWARD_PICTURES);
const praises = new ShuffleBag(PRAISE_PHRASES);
const speaker = new Speaker(SPEECH);
let playerName = readPlayerName();
let nameWhenSettingsOpened = '';
let wordsPerGame = readWordsPerGame(); // null: no end
let wordsFound = 0; // in this game

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

function cleanName(text) {
  return text.replace(/[^\p{L}\p{M}' -]/gu, '').trim().slice(0, 30);
}

// The player's name is kept on the device only, never in the code. It is set
// on the settings screen, or by a link (?name=Sam) for first-time setup.
function savePlayerName(text) {
  const name = cleanName(text);
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    // Storage can be unavailable (e.g. private browsing); the name lasts until the page closes.
  }
  return name;
}

// A name in the link is used only when it differs from the last link seen,
// so a Home Screen icon (whose link can't be changed) doesn't undo a name
// changed on the settings screen.
function readPlayerName() {
  const param = new URLSearchParams(window.location.search).get('name');
  try {
    if (param !== null && param !== localStorage.getItem(LINK_NAME_KEY)) {
      localStorage.setItem(LINK_NAME_KEY, param);
      return savePlayerName(param);
    }
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return cleanName(param ?? '');
  }
}

function readWordsPerGame() {
  try {
    const saved = Number(localStorage.getItem(WORDS_PER_GAME_KEY));
    return WORDS_PER_GAME_CHOICES.includes(saved) ? saved : null;
  } catch {
    return null;
  }
}

function saveWordsPerGame(count) {
  wordsPerGame = count;
  try {
    if (count) localStorage.setItem(WORDS_PER_GAME_KEY, String(count));
    else localStorage.removeItem(WORDS_PER_GAME_KEY);
  } catch {
    // Storage can be unavailable; the setting lasts until the page closes.
  }
}

// Fills `container` with `count` dots, the first `filled` of them filled.
function showDots(container, count, filled, { popLast = false } = {}) {
  container.replaceChildren(...Array.from({ length: count }, (_, i) => {
    const dot = document.createElement('span');
    dot.className = 'dot';
    if (i < filled) dot.classList.add('filled');
    if (popLast && i === filled - 1) dot.classList.add('just-filled');
    return dot;
  }));
}

function showProgress(options) {
  progressEl.hidden = !wordsPerGame;
  if (!wordsPerGame) return;
  showDots(progressEl, wordsPerGame, wordsFound, options);
  progressEl.setAttribute('aria-label', `${wordsFound} of ${wordsPerGame} words found`);
}

function isGameOver() {
  return wordsPerGame !== null && wordsFound >= wordsPerGame;
}

// Ends a game: all the dots filled, a spoken "All done!", and a Play again button.
function showDone() {
  showDots(document.getElementById('done-dots'), wordsPerGame, wordsPerGame);
  doneEl.hidden = false;
  void doneEl.offsetWidth; // let the fade-in start from the beginning
  doneEl.classList.add('visible');
  speaker.say([{ text: fillPhrase(DONE_PHRASE, ''), clip: DONE_CLIP }], { interrupt: true });
}

function playAgain() {
  speaker.stop();
  wordsFound = 0;
  showProgress();
  startRound();
  doneEl.classList.remove('visible');
  setTimeout(() => { doneEl.hidden = true; }, FADE_MS);
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
const DONE_CLIP = 'done';
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
  lastActivityAt = performance.now();
  if (sayOnRelease) {
    sayOnRelease = false;
    const template = nextPraise();
    const praising = sayWordThen({ template, clip: praiseClip(template) }, { interrupt: true, onDone: scheduleReward });
    if (!praising) scheduleReward();
  } else if (event.type === 'pointerup' && event.target.closest('#target')) {
    sayWordThen({ template: INVITE_PHRASE, clip: INVITE_CLIP });
  } else {
    // Lets later speech (the reminder) start without a tap.
    speaker.unlock();
  }
}

// Opens the grown-up settings screen.
function showSettings() {
  nameWhenSettingsOpened = playerName;
  document.getElementById('player-name').value = playerName;
  document.getElementById('words-per-game').value = String(wordsPerGame ?? '');
  showRecordings();
  updateNameNote();
}

// Lists the phrases to record, using the current name.
function showRecordings() {
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
    {
      title: 'When all the words in a game are found',
      items: [{ id: DONE_CLIP, label: fillPhrase(DONE_PHRASE, 'it') }],
    },
  ], speaker);
}

// Points out that recorded phrases still say the old name.
function updateNameNote() {
  const phraseClips = [INVITE_CLIP, DONE_CLIP, ...PRAISE_PHRASES.map(praiseClip)];
  const note = document.getElementById('name-note');
  note.hidden = playerName === nameWhenSettingsOpened || !phraseClips.some((id) => speaker.hasClip(id));
}

function watchNameField() {
  const field = document.getElementById('player-name');
  field.addEventListener('input', () => {
    playerName = savePlayerName(field.value);
    showRecordings();
    updateNameNote();
  });
  // Changing the game length starts a new count.
  const select = document.getElementById('words-per-game');
  select.replaceChildren(...WORDS_PER_GAME_CHOICES.map((count) => new Option(count ?? 'Unlimited', count ?? '')));
  select.addEventListener('change', () => {
    saveWordsPerGame(select.value ? Number(select.value) : null);
    wordsFound = 0;
    showProgress();
    fitToScreen();
  });

  // Lets the name's pronunciation be checked with the built-in voice.
  document.getElementById('hear-name').addEventListener('click', () => {
    speaker.say([{ text: fillPhrase('Well done, {name}!', '') }], { interrupt: true });
  });
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
      showSettings();
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
  wordsFound += 1;
  showProgress({ popLast: true });
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
    if (isGameOver()) showDone();
    else startRound();
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
  const progress = wordsPerGame ? 0.3 : 0; // height of the progress dots
  const width = window.innerWidth - 2 * pad;
  const height = window.innerHeight - 2 * pad - gap * (wordsPerGame ? 2 : 1);
  const longest = Math.max(...WORDS.map((w) => w.word.length));
  const lettersWidth = longest * tileScale * 1.1;
  const cell = Math.floor(Math.min(
    width / GRID_SIZE,
    height / (GRID_SIZE + progress + minPictureHeight),
    width / (minPictureHeight * pictureAspect + pictureGap + lettersWidth),
  ));
  const pictureHeight = Math.min(
    maxPictureHeight * cell,
    height - (GRID_SIZE + progress) * cell,
    (width - (pictureGap + lettersWidth) * cell) / pictureAspect,
  );
  const style = document.documentElement.style;
  style.setProperty('--size', GRID_SIZE);
  style.setProperty('--cell', `${cell}px`);
  style.setProperty('--tile', `${Math.floor(cell * tileScale)}px`);
  style.setProperty('--picture-w', `${Math.floor(pictureHeight * pictureAspect)}px`);
  style.setProperty('--picture-h', `${Math.floor(pictureHeight)}px`);
  style.setProperty('--picture-gap', `${Math.floor(cell * pictureGap)}px`);
  style.setProperty('--dot', `${Math.floor(cell * progress) || 0}px`);
}

gridEl.addEventListener('pointerdown', onTap);
document.addEventListener('pointerup', onRelease);
document.addEventListener('pointercancel', onRelease);
// Stop long-press menus and pinch zoom from getting in the way.
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('input')) e.preventDefault();
});
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
watchNameField();
loadVoiceRecordings().then(() => {
  if (new URLSearchParams(window.location.search).has('setup')) showSettings();
});

document.getElementById('play-again').addEventListener('click', playAgain);

showProgress();
fitToScreen();
startRound();
