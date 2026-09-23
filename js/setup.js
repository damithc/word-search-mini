// The grown-up screen for recording the phrases the game says.
//
// Recordings are captured as raw samples rather than with MediaRecorder,
// because iPad Safari cannot always play back its own compressed recordings.

import { saveRecording, deleteRecording, keepRecordings } from './recordings.js';

// Recording stops by itself after this long, in case Stop is forgotten.
const MAX_RECORDING_MS = 8000;
const MIN_RECORDING_S = 0.2;

const setupEl = document.getElementById('setup');
const listEl = document.getElementById('setup-list');
const messageEl = document.getElementById('setup-message');
const doneButton = document.getElementById('setup-done');

let current = null; // the recording in progress
let starting = false; // waiting for the microphone
let speaker = null;

function showMessage(text) {
  messageEl.textContent = text;
  messageEl.hidden = !text;
}

function describe(error) {
  return error?.name ? `${error.name}: ${error.message}` : String(error);
}

// Tells iPad Safari whether the microphone is in use, so sound comes out of
// the speaker at normal volume afterwards.
function setAudioSession(type) {
  try {
    if (navigator.audioSession) navigator.audioSession.type = type;
  } catch {
    // not supported
  }
}

function rowFor(id) {
  return listEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
}

function updateRow(row) {
  const recorded = speaker.hasClip(row.dataset.id);
  const recording = current?.id === row.dataset.id;
  row.classList.toggle('recorded', recorded);
  row.classList.toggle('recording', recording);
  const record = row.querySelector('.record');
  record.textContent = recording ? 'Stop' : recorded ? 'Re-record' : 'Record';
  record.disabled = (Boolean(current) || starting) && !recording;
  row.querySelector('.play').disabled = !recorded || recording;
  row.querySelector('.delete').disabled = !recorded || recording;
}

function updateAll() {
  for (const row of listEl.querySelectorAll('.setup-row')) updateRow(row);
}

async function startRecording(id) {
  if (!navigator.mediaDevices?.getUserMedia) {
    showMessage('Recording needs the https:// address of this page.');
    return;
  }
  speaker.stop();
  starting = true;
  updateAll();
  setAudioSession('play-and-record');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    // Created after the microphone is on, so it runs at the microphone's sample rate.
    const context = new (window.AudioContext || window.webkitAudioContext)();
    context.resume().catch(() => {});
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    processor.onaudioprocess = (event) => chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    source.connect(processor);
    processor.connect(context.destination); // needed for processing to run; outputs silence
    current = { id, stream, context, source, processor, chunks, timer: setTimeout(stopRecording, MAX_RECORDING_MS) };
    showMessage('');
  } catch (error) {
    setAudioSession('playback');
    showMessage(`Could not use the microphone (${describe(error)}). Check that this page is allowed to use it.`);
  }
  starting = false;
  updateAll();
}

// Runs within the Stop tap, so the recording can be played straight back.
function stopRecording() {
  if (!current) return;
  const { id, stream, context, source, processor, chunks, timer } = current;
  current = null;
  clearTimeout(timer);
  processor.onaudioprocess = null;
  source.disconnect();
  processor.disconnect();
  for (const track of stream.getTracks()) track.stop();
  const { sampleRate, state } = context;
  context.close().catch(() => {});
  setAudioSession('playback');
  speaker.resetAudio();

  const samples = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    samples.set(chunk, at);
    at += chunk.length;
  }
  if (samples.length < MIN_RECORDING_S * sampleRate) {
    showMessage(`Nothing was recorded (audio was ${state}). Please try again.`);
    updateAll();
    return;
  }

  try {
    const trimmed = speaker.setClipFromSamples(id, samples, sampleRate);
    playClip(id);
    const pcm = Int16Array.from(trimmed, (s) => Math.max(-1, Math.min(1, s)) * 0x7fff);
    saveRecording(id, { pcm: pcm.buffer, sampleRate })
      .then(keepRecordings)
      .catch((error) => showMessage(`The recording could not be saved (${describe(error)}).`));
    showMessage('');
  } catch (error) {
    showMessage(`The recording could not be used (${describe(error)}).`);
  }
  updateAll();
}

function playClip(id) {
  const row = rowFor(id);
  speaker.say([{ clip: id, text: row.dataset.label }], { interrupt: true });
}

async function onClick(event) {
  const button = event.target.closest('button');
  const row = event.target.closest('.setup-row');
  if (!button || !row) return;
  const { id } = row.dataset;

  if (button.classList.contains('record')) {
    if (current?.id === id) stopRecording();
    else if (!current && !starting) await startRecording(id);
  } else if (button.classList.contains('play')) {
    playClip(id);
  } else if (button.classList.contains('delete')) {
    speaker.removeClip(id);
    updateRow(row);
    await deleteRecording(id).catch((error) => showMessage(`Could not delete (${describe(error)}).`));
  }
}

// sections: [{ title, items: [{ id, label }] }]
export function openSetup(sections, theSpeaker) {
  speaker = theSpeaker;
  listEl.replaceChildren(...sections.flatMap(({ title, items }) => {
    const heading = document.createElement('h2');
    heading.textContent = title;
    return [heading, ...items.map(({ id, label }) => {
      const row = document.createElement('div');
      row.className = 'setup-row';
      row.dataset.id = id;
      row.dataset.label = label;
      row.innerHTML = '<span class="label"></span>'
        + '<button class="record"></button><button class="play">Play</button>'
        + '<button class="delete">Delete</button>';
      row.querySelector('.label').textContent = label;
      updateRow(row);
      return row;
    })];
  }));
  showMessage('');
  setupEl.hidden = false;
}

listEl.addEventListener('click', onClick);
doneButton.addEventListener('click', () => {
  stopRecording();
  speaker.stop();
  setupEl.hidden = true;
});
