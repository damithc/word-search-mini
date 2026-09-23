// Says short sequences of phrases aloud, using a recording for a phrase when
// one is given and the device's built-in voice otherwise.
//
// iPad Safari only plays sound in direct response to a tap, and counts the
// finger lifting (not landing) as the tap. So call say() from a pointerup
// handler, not from pointerdown or a timer.

// Ignore requests that come sooner than this after the last one, so repeated
// taps don't keep restarting the speech.
const MIN_GAP_MS = 1000;
// Treat speech as finished after this long even if the device still reports
// it as speaking, which some browsers occasionally get stuck on.
const MAX_BUSY_MS = 8000;

const NOVELTY_VOICES = new RegExp('^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|'
  + 'Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph|'
  + 'Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\\b', 'i');

export class Speaker {
  constructor({ enabled = true, lang = 'en-US', rate = 1 } = {}) {
    this.enabled = enabled;
    this.lang = lang;
    this.rate = rate;
    this.recordings = new Map(); // url -> Audio, or null if it failed to load
    this.lastSaidAt = -Infinity;
    this.currentAudio = null;
    this.voice = null;

    if (this.enabled && 'speechSynthesis' in window) {
      this.pickVoice();
      speechSynthesis.addEventListener?.('voiceschanged', () => this.pickVoice());
    }
  }

  // Picks the clearest natural voice for the chosen language, skipping the
  // novelty and robotic voices that Apple devices include.
  pickVoice() {
    const lang = this.lang.toLowerCase().replace('_', '-');
    const score = (v) => (/premium/i.test(v.name) ? 4 : /enhanced/i.test(v.name) ? 3 : 0)
      + (v.default ? 2 : 0) + (/samantha/i.test(v.name) ? 1 : 0);
    const voices = speechSynthesis.getVoices()
      .filter((v) => v.lang.toLowerCase().replace('_', '-') === lang && !NOVELTY_VOICES.test(v.name))
      .sort((a, b) => score(b) - score(a));
    this.voice = voices[0] ?? null;
  }

  // Start loading recordings early so they are ready when needed.
  preload(url) {
    if (!this.enabled || !url || this.recordings.has(url)) return;
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.addEventListener('error', () => this.recordings.set(url, null));
    this.recordings.set(url, audio);
  }

  isBusy() {
    const elapsed = performance.now() - this.lastSaidAt;
    if (elapsed < MIN_GAP_MS) return true;
    if (elapsed > MAX_BUSY_MS) return false;
    return Boolean(this.currentAudio) || ('speechSynthesis' in window && speechSynthesis.speaking);
  }

  // Says the parts in order. Each part is { text, recording? }.
  // Unless `interrupt` is set, does nothing while something is still being said.
  // Returns whether anything is being said.
  say(parts, { interrupt = false } = {}) {
    if (!this.enabled || (!interrupt && this.isBusy())) return false;
    this.stop();
    this.lastSaidAt = performance.now();
    this.sayInOrder(parts);
    return true;
  }

  stop() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (this.currentAudio) {
      this.currentAudio.onended = null;
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }

  // Built-in voice parts are queued straight away; a recording has to finish
  // before the parts after it are started.
  sayInOrder(parts) {
    if (parts.length === 0) return;
    const [{ text, recording }, ...rest] = parts;
    this.preload(recording);
    const audio = recording && this.recordings.get(recording);
    if (!audio) {
      this.speak(text);
      this.sayInOrder(rest);
      return;
    }
    this.currentAudio = audio;
    audio.currentTime = 0;
    audio.onended = () => {
      this.currentAudio = null;
      this.sayInOrder(rest);
    };
    audio.play().catch(() => {
      this.currentAudio = null;
      this.speak(text);
      this.sayInOrder(rest);
    });
  }

  speak(text) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.lang;
    utterance.rate = this.rate;
    if (this.voice) utterance.voice = this.voice;
    speechSynthesis.speak(utterance);
  }
}
