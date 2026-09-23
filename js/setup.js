// The grown-up screen for recording the phrases the game says.

import { saveRecording, deleteRecording, keepRecordings } from './recordings.js';

// Recording stops by itself after this long, in case Stop is forgotten.
const MAX_RECORDING_MS = 8000;

const setupEl = document.getElementById('setup');
const listEl = document.getElementById('setup-list');
const messageEl = document.getElementById('setup-message');
const doneButton = document.getElementById('setup-done');

let current = null; // { id, recorder, stream, timer } while recording
let speaker = null;

function pickMimeType() {
  const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) ?? '';
}

function showMessage(text) {
  messageEl.textContent = text;
  messageEl.hidden = !text;
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
  record.disabled = Boolean(current) && !recording;
  row.querySelector('.play').disabled = !recorded || recording;
  row.querySelector('.delete').disabled = !recorded || recording;
}

function updateAll() {
  for (const row of listEl.querySelectorAll('.setup-row')) updateRow(row);
}

async function startRecording(id) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showMessage('Recording needs the https:// address of this page.');
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch {
    showMessage('Could not use the microphone. Check that this page is allowed to use it.');
    return;
  }
  showMessage('');
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  recorder.onstop = () => finishRecording(id, new Blob(chunks, { type: recorder.mimeType }));
  recorder.start();
  current = { id, recorder, stream, timer: setTimeout(stopRecording, MAX_RECORDING_MS) };
  updateAll();
}

function stopRecording() {
  if (!current) return;
  clearTimeout(current.timer);
  current.recorder.stop();
  for (const track of current.stream.getTracks()) track.stop();
}

async function finishRecording(id, blob) {
  current = null;
  try {
    const data = await blob.arrayBuffer();
    await speaker.setClip(id, data);
    await saveRecording(id, { data, type: blob.type });
    keepRecordings();
    playClip(id);
  } catch {
    showMessage('That recording could not be saved. Please try again.');
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
  speaker.unlock();

  if (button.classList.contains('record')) {
    if (current?.id === id) stopRecording();
    else if (!current) await startRecording(id);
  } else if (button.classList.contains('play')) {
    playClip(id);
  } else if (button.classList.contains('delete')) {
    speaker.removeClip(id);
    await deleteRecording(id);
    updateRow(row);
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
