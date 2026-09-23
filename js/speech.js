// Says short sequences of phrases aloud, using a recorded clip for each
// phrase that has one and the device's built-in voice for the rest.
//
// Clips are played with an <audio> element rather than Web Audio, because
// iPad Safari mutes Web Audio when the iPad is in Silent mode.
//
// iPad Safari only lets sound start from a tap (the finger lifting, not
// landing), though once the voice or the audio element has been started from
// a tap it may continue later. So call say() from a pointerup or click
// handler; it starts everything the sequence needs at that moment.

// Ignore requests that come sooner than this after the last one, so repeated
// taps don't keep restarting the speech.
const MIN_GAP_MS = 1000;
// Treat a sequence as finished after this long even if an end event never
// arrives, which some browsers occasionally fail to send.
const MAX_BUSY_MS = 10000;
const CLIP_TIMEOUT_MS = 1000; // allowed beyond the clip's length
// A generous guess at how long the built-in voice takes, used in case it
// never reports finishing: this long per character, plus a second.
const SPEECH_MS_PER_CHAR = 110;
// Clips are brought to about the loudness of the built-in voice, judged by
// their average level while speaking, without boosting quiet ones too much.
const TARGET_LOUDNESS = 0.25;
const MAX_GAIN = 8;
// Above this level, peaks are gently squashed instead of distorting.
const LIMIT_FROM = 0.7;

const NOVELTY_VOICES = new RegExp('^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|'
  + 'Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph|'
  + 'Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\\b', 'i');

// Drops the silence before and after the spoken part of a recording.
function trim(samples, sampleRate) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const threshold = Math.max(0.01, peak * 0.08);
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < threshold) first++;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) < threshold) last--;
  if (first >= last) return samples;
  const start = Math.max(0, first - Math.round(0.05 * sampleRate));
  const end = Math.min(samples.length, last + Math.round(0.15 * sampleRate));
  return samples.subarray(start, end);
}

// The average level of the spoken parts (20 ms stretches clearly above the
// quietest), so pauses between words don't make a clip seem quieter.
function speakingLevel(samples, sampleRate) {
  const size = Math.max(1, Math.round(0.02 * sampleRate));
  const levels = [];
  for (let at = 0; at < samples.length; at += size) {
    const frame = samples.subarray(at, at + size);
    levels.push(Math.sqrt(frame.reduce((sum, s) => sum + s * s, 0) / frame.length));
  }
  const loudest = Math.max(...levels);
  const spoken = levels.filter((level) => level > loudest * 0.1);
  return Math.sqrt(spoken.reduce((sum, level) => sum + level * level, 0) / spoken.length);
}

function limit(s) {
  const size = Math.abs(s);
  if (size <= LIMIT_FROM) return s;
  const room = 1 - LIMIT_FROM;
  return Math.sign(s) * (LIMIT_FROM + room * Math.tanh((size - LIMIT_FROM) / room));
}

// Makes a 16-bit mono WAV file, brought to a standard loudness.
function toWav(samples, sampleRate) {
  const level = samples.length > 0 ? speakingLevel(samples, sampleRate) : 0;
  const gain = level > 0 ? Math.min(TARGET_LOUDNESS / level, MAX_GAIN) : 1;
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); // format chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per sample
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, limit(s * gain) * 0x7fff, true));
  return new Blob([view], { type: 'audio/wav' });
}

// A tenth of a second of silence, played to let the audio element be used
// later without a tap.
const SILENCE_URL = URL.createObjectURL(toWav(new Float32Array(4410), 44100));

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
    this.clips = new Map(); // clip id -> { url, duration }
    this.player = new Audio();
    this.sequence = null; // identifies the sequence being said
    this.lastSaidAt = -Infinity;
    this.voice = null;
    this.onError = null; // called with a description when a clip fails to play
    this.unlocked = false;

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

  // Adds a clip from raw samples. Returns the samples with silence trimmed off.
  setClipFromSamples(id, samples, sampleRate) {
    const trimmed = trim(samples, sampleRate);
    this.removeClip(id);
    this.clips.set(id, {
      url: URL.createObjectURL(toWav(trimmed, sampleRate)),
      duration: trimmed.length / sampleRate,
    });
    return trimmed;
  }

  // Adds a clip from a compressed recording (as saved by older versions).
  async setClipFromFile(id, data) {
    const decoder = new OfflineAudioContext(1, 1, 44100);
    const buffer = await decoder.decodeAudioData(data.slice(0));
    this.setClipFromSamples(id, buffer.getChannelData(0), buffer.sampleRate);
  }

  removeClip(id) {
    const clip = this.clips.get(id);
    if (clip) URL.revokeObjectURL(clip.url);
    this.clips.delete(id);
  }

  hasClip(id) {
    return this.clips.has(id);
  }

  // Lets speech and clips start later without a tap (e.g. a reminder).
  // Must be called from a tap that doesn't itself start speech; only the
  // first call does anything.
  unlock() {
    if (this.unlocked || !this.enabled || this.sequence) return;
    this.unlocked = true;
    this.speak(' ', { volume: 0 });
    this.playUrl(SILENCE_URL).catch(() => {});
  }

  isBusy() {
    const elapsed = performance.now() - this.lastSaidAt;
    return elapsed < MIN_GAP_MS || (this.sequence !== null && elapsed < MAX_BUSY_MS);
  }

  // Says the parts in order. Each part is { text, clip? } where clip is a clip id.
  // Unless `interrupt` is set, does nothing while something is still being said.
  // onDone is called a short pause after the last part, unless it is stopped.
  // Returns whether anything is being said.
  say(parts, { interrupt = false, onDone = null } = {}) {
    if (!this.enabled || (!interrupt && this.isBusy())) return false;
    this.stop();
    this.lastSaidAt = performance.now();
    const steps = parts.map((part) => ({ text: part.text, clip: part.clip && this.clips.get(part.clip) }));

    // Unlock now, during the tap, whatever later parts will need.
    if (!steps[0].clip && steps.some((step) => step.clip)) this.playUrl(SILENCE_URL).catch(() => {});
    if (steps[0].clip && steps.some((step) => !step.clip)) this.speak(' ', { volume: 0 });

    const sequence = { onDone };
    this.sequence = sequence;
    this.playFrom(steps, 0, sequence);
    return true;
  }

  playFrom(steps, index, sequence) {
    if (this.sequence !== sequence) return; // stopped or replaced
    if (index >= steps.length) {
      this.sequence = null;
      sequence.onDone?.();
      return;
    }
    const step = steps[index];
    const next = once(() => setTimeout(() => this.playFrom(steps, index + 1, sequence), this.pauseMs));
    if (step.clip) this.sayWithClip(step, next, sequence);
    else this.sayWithVoice(step.text, next);
  }

  sayWithClip(step, next, sequence) {
    const timer = setTimeout(next, step.clip.duration * 1000 + CLIP_TIMEOUT_MS);
    this.player.onended = next;
    this.playUrl(step.clip.url).catch((error) => {
      if (this.sequence !== sequence) return; // stopped while starting
      // Say it with the built-in voice instead.
      clearTimeout(timer);
      this.player.onended = null;
      this.onError?.(`${error.name}: ${error.message}`);
      this.sayWithVoice(step.text, next);
    });
  }

  sayWithVoice(text, next) {
    const utterance = this.speak(text);
    if (!utterance) {
      next();
      return;
    }
    utterance.onend = next;
    utterance.onerror = next;
    setTimeout(next, (text.length * SPEECH_MS_PER_CHAR) / this.rate + 1000);
  }

  playUrl(url) {
    this.player.src = url;
    return this.player.play();
  }

  stop() {
    this.sequence = null;
    // Cancelling only when needed: some browsers then lose the next "finished" event.
    if ('speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending)) {
      speechSynthesis.cancel();
    }
    this.player.onended = null;
    this.player.pause();
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
