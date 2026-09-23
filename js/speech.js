// Says short sequences of phrases aloud, using a recorded clip for each
// phrase that has one and the device's built-in voice for the rest.
//
// iPad Safari only lets sound start from a tap (the finger lifting, not
// landing), though once speech or clip playback has been started from a tap
// it may continue later. So call say() from a pointerup or click handler;
// it starts everything the sequence needs at that moment.

// Ignore requests that come sooner than this after the last one, so repeated
// taps don't keep restarting the speech.
const MIN_GAP_MS = 1000;
// Treat a sequence as finished after this long even if an end event never
// arrives, which some browsers occasionally fail to send.
const MAX_BUSY_MS = 10000;
const PART_TIMEOUT_MS = 6000;
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

// Calls fn at most once.
function once(fn) {
  let called = false;
  return () => {
    if (!called) {
      called = true;
      fn();
    }
  };
}

export class Speaker {
  // pauseMs is the silence between the parts of a sequence.
  constructor({ enabled = true, lang = 'en-US', rate = 1, pauseMs = 500 } = {}) {
    this.enabled = enabled;
    this.lang = lang;
    this.rate = rate;
    this.pauseMs = pauseMs;
    this.clips = new Map(); // clip id -> trimmed, levelled recording
    this.sources = []; // clips playing
    this.sequence = null; // identifies the sequence being said
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
    if (!this.context || this.context.state === 'closed') {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.context;
  }

  // Starts over with a fresh audio output. iPad Safari can leave the old one
  // silent after the microphone has been used.
  resetAudio() {
    this.stop();
    this.context?.close().catch(() => {});
    this.context = null;
  }

  // Adds a clip from a compressed recording (as saved by older versions).
  async setClipFromFile(id, data) {
    const buffer = await this.audioContext().decodeAudioData(data.slice(0));
    this.clips.set(id, trimAndLevel(buffer));
  }

  // Adds a clip from raw samples. Returns the samples with silence trimmed off.
  setClipFromSamples(id, samples, sampleRate) {
    const buffer = new AudioBuffer({ length: samples.length, numberOfChannels: 1, sampleRate });
    buffer.copyToChannel(samples, 0);
    const clip = trimAndLevel(buffer);
    this.clips.set(id, clip);
    const start = Math.round(clip.offset * sampleRate);
    return samples.subarray(start, start + Math.round(clip.duration * sampleRate));
  }

  removeClip(id) {
    this.clips.delete(id);
  }

  hasClip(id) {
    return this.clips.has(id);
  }

  isBusy() {
    const elapsed = performance.now() - this.lastSaidAt;
    return elapsed < MIN_GAP_MS || (this.sequence !== null && elapsed < MAX_BUSY_MS);
  }

  // Says the parts in order. Each part is { text, clip? } where clip is a clip id.
  // Unless `interrupt` is set, does nothing while something is still being said.
  // Returns whether anything is being said.
  say(parts, { interrupt = false } = {}) {
    if (!this.enabled || (!interrupt && this.isBusy())) return false;
    this.stop();
    this.lastSaidAt = performance.now();
    const steps = parts.map((part) => ({ text: part.text, clip: part.clip && this.clips.get(part.clip) }));

    // Unlock now, during the tap, whatever later parts will need.
    if (steps.some((step) => step.clip)) this.audioContext().resume();
    if (steps[0].clip && steps.some((step) => !step.clip)) this.speak(' ', { volume: 0 });

    const sequence = {};
    this.sequence = sequence;
    this.playFrom(steps, 0, sequence);
    return true;
  }

  playFrom(steps, index, sequence) {
    if (this.sequence !== sequence) return; // stopped or replaced
    if (index >= steps.length) {
      this.sequence = null;
      return;
    }
    const step = steps[index];
    const next = once(() => setTimeout(() => this.playFrom(steps, index + 1, sequence), this.pauseMs));

    if (step.clip) {
      const context = this.audioContext();
      const source = context.createBufferSource();
      source.buffer = step.clip.buffer;
      const gain = context.createGain();
      gain.gain.value = step.clip.gain;
      source.connect(gain).connect(context.destination);
      source.onended = next;
      source.start(context.currentTime + 0.05, step.clip.offset, step.clip.duration);
      this.sources.push(source);
      setTimeout(next, step.clip.duration * 1000 + PART_TIMEOUT_MS);
      return;
    }

    const utterance = this.speak(step.text);
    if (!utterance) {
      next();
      return;
    }
    utterance.onend = next;
    utterance.onerror = next;
    setTimeout(next, PART_TIMEOUT_MS);
  }

  stop() {
    this.sequence = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.sources = [];
  }

  speak(text, { volume = 1 } = {}) {
    if (!('speechSynthesis' in window)) return null;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.lang;
    utterance.rate = this.rate;
    utterance.volume = volume;
    if (this.voice) utterance.voice = this.voice;
    speechSynthesis.speak(utterance);
    return utterance;
  }
}
