// Says short sequences of phrases aloud, using recorded clips when every
// phrase in the sequence has one and the device's built-in voice otherwise,
// so the voice never changes partway through.
//
// iPad Safari only plays sound in direct response to a tap, and counts the
// finger lifting (not landing) as the tap. So call say() from a pointerup or
// click handler, not from pointerdown or a timer. All clips in a sequence are
// scheduled at that moment for the same reason.

// Ignore requests that come sooner than this after the last one, so repeated
// taps don't keep restarting the speech.
const MIN_GAP_MS = 1000;
// Treat built-in speech as finished after this long even if the device still
// reports it as speaking, which some browsers occasionally get stuck on.
const MAX_BUSY_MS = 8000;
// Silence between clips in a sequence.
const CLIP_GAP_S = 0.25;
// Clips are made about equally loud, without boosting quiet ones too much.
const TARGET_PEAK = 0.8;
const MAX_GAIN = 6;

const NOVELTY_VOICES = new RegExp('^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|'
  + 'Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph|'
  + 'Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\\b', 'i');

// Finds the spoken part of a recording (dropping silence before and after)
// and the gain that brings it to a standard loudness.
function trimAndLevel(buffer) {
  const samples = buffer.getChannelData(0);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const threshold = Math.max(0.01, peak * 0.08);
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < threshold) first++;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) < threshold) last--;
  if (first >= last) return { buffer, offset: 0, duration: buffer.duration, gain: 1 };

  const rate = buffer.sampleRate;
  const start = Math.max(0, first - Math.round(0.05 * rate));
  const end = Math.min(samples.length, last + Math.round(0.15 * rate));
  return {
    buffer,
    offset: start / rate,
    duration: (end - start) / rate,
    gain: Math.min(TARGET_PEAK / peak, MAX_GAIN),
  };
}

export class Speaker {
  constructor({ enabled = true, lang = 'en-US', rate = 1 } = {}) {
    this.enabled = enabled;
    this.lang = lang;
    this.rate = rate;
    this.clips = new Map(); // clip id -> trimmed, levelled recording
    this.sources = []; // clips currently scheduled to play
    this.busyUntil = 0;
    this.lastSaidAt = -Infinity;
    this.context = null;
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

  audioContext() {
    this.context ??= new (window.AudioContext || window.webkitAudioContext)();
    return this.context;
  }

  // Lets clips play. Must be called from a tap.
  unlock() {
    if (this.clips.size > 0) this.audioContext().resume();
  }

  async setClip(id, data) {
    const buffer = await this.audioContext().decodeAudioData(data.slice(0));
    this.clips.set(id, trimAndLevel(buffer));
  }

  removeClip(id) {
    this.clips.delete(id);
  }

  hasClip(id) {
    return this.clips.has(id);
  }

  isBusy() {
    const now = performance.now();
    const elapsed = now - this.lastSaidAt;
    if (elapsed < MIN_GAP_MS || now < this.busyUntil) return true;
    return elapsed < MAX_BUSY_MS && 'speechSynthesis' in window && speechSynthesis.speaking;
  }

  // Says the parts in order. Each part is { text, clip? } where clip is a clip id.
  // Unless `interrupt` is set, does nothing while something is still being said.
  // Returns whether anything is being said.
  say(parts, { interrupt = false } = {}) {
    if (!this.enabled || (!interrupt && this.isBusy())) return false;
    this.stop();
    this.lastSaidAt = performance.now();
    const clips = parts.map((part) => part.clip && this.clips.get(part.clip));
    if (clips.every(Boolean)) this.playClips(clips);
    else parts.forEach((part) => this.speak(part.text));
    return true;
  }

  stop() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    for (const source of this.sources) source.stop();
    this.sources = [];
    this.busyUntil = 0;
  }

  playClips(clips) {
    const context = this.audioContext();
    context.resume();
    let at = context.currentTime + 0.05;
    for (const clip of clips) {
      const source = context.createBufferSource();
      source.buffer = clip.buffer;
      const gain = context.createGain();
      gain.gain.value = clip.gain;
      source.connect(gain).connect(context.destination);
      source.start(at, clip.offset, clip.duration);
      this.sources.push(source);
      at += clip.duration + CLIP_GAP_S;
    }
    this.busyUntil = performance.now() + (at - context.currentTime) * 1000;
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
