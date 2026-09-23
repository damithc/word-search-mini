// Says words aloud, using a recording when one is given and the device's
// built-in voice otherwise.
//
// iPad Safari only plays sound in direct response to a tap, and counts the
// finger lifting (not landing) as the tap. So call say() from a pointerup
// handler, not from pointerdown or a timer.

// Ignore requests that come sooner than this after the last one, so repeated
// taps don't keep restarting the word.
const MIN_GAP_MS = 1000;

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

  // Returns whether the word is being said.
  say(text, recordingUrl) {
    if (!this.enabled) return false;
    const now = performance.now();
    if (now - this.lastSaidAt < MIN_GAP_MS) return false;
    this.lastSaidAt = now;

    this.preload(recordingUrl);
    const audio = recordingUrl && this.recordings.get(recordingUrl);
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => this.speak(text));
    } else {
      this.speak(text);
    }
    return true;
  }

  speak(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    // Lower case, so short words are said as words rather than spelled out.
    const utterance = new SpeechSynthesisUtterance(text.toLowerCase());
    utterance.lang = this.lang;
    utterance.rate = this.rate;
    if (this.voice) utterance.voice = this.voice;
    speechSynthesis.speak(utterance);
  }
}
