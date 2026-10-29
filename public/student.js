import { api, post, byId, DIGITS, fmt, forward, image, networkDiagram } from './common.js';

let controls, network, samples = [], sampleIndex = 0, autoSamples = false, weightVersion = 0;
let sending = false, pendingValue = null;
let sampleTimer = null;
let preTeacherSampleIndex = null;
let fourImages = false, fourStep = 0;
let samplesByDigit = [];
const notify = (message, error = false) => {
  const box = byId('message'); box.textContent = message; box.classList.remove('hidden'); box.classList.toggle('error', error);
  clearTimeout(notify.timeout); notify.timeout = setTimeout(() => box.classList.add('hidden'), 5000);
};

async function init() {
  const joined = await post('/api/join', {});
  controls = joined.controls;
  network = joined.weights.network;
  weightVersion = joined.weights.weightVersion;
  const cached = sessionStorage.getItem(`observations-${joined.manifest.version}`);
  const observations = cached ? JSON.parse(cached) : await api('/api/observation');
  samples = observations.samples;
  samplesByDigit = DIGITS.map(digit => samples.filter(sample => sample.digit === digit));
  const guideSample = samples.find(sample => sample.digit === 1) || samples[0];
  image(byId('guide-original'), guideSample.original, 28);
  image(byId('guide-resized'), guideSample.pixels, 6);
  byId('guide-digit').textContent = String(guideSample.digit);
  if (controls.student.weightId?.startsWith('0:')) {
    const inputIndex = Number(controls.student.weightId.split(':')[2]);
    sampleIndex = samples.reduce((best, sample, index) => sample.pixels[inputIndex] > samples[best].pixels[inputIndex] ? index : best, 0);
  }
  if (controls.fixedSampleId) preTeacherSampleIndex = sampleIndex;
  if (!cached) { try { sessionStorage.setItem(`observations-${joined.manifest.version}`, JSON.stringify(observations)); } catch {} }
  byId('sample-select').replaceChildren(...samples.map((sample, index) => {
    const option = document.createElement('option'); option.value = String(index); option.textContent = `${index + 1}. 数字 ${sample.digit}`; return option;
  }));
  render();
  byId('connection').textContent = '接続中';
  setInterval(refreshControls, 1500);
  setInterval(() => { if (byId('auto-sync').checked) refreshWeights(); }, 2000);
}

function assignedValue() {
  const id = controls.student.weightId;
  if (!id) return null;
  const [l, j, i] = id.split(':').map(Number);
  return network.layers[l]?.weights[j]?.[i] ?? null;
}

function selectSample(index) {
  if (controls.fixedSampleId || autoSamples || fourImages) return;
  sampleIndex = (index + samples.length) % samples.length;
  render();
}

function advanceSamples(change) {
  if (controls.fixedSampleId || !samples.length) return;
  if (fourImages) {
    const count = Math.max(...samplesByDigit.map(group => group.length));
    fourStep = (fourStep + change + count) % count;
  } else {
    sampleIndex = (sampleIndex + change + samples.length) % samples.length;
  }
  render();
}

function outputRows(outputs, correctDigit, compact = false) {
  return outputs.map((value, index) => {
    const item = document.createElement('div');
    item.className = `${compact ? 'mini-output-row' : 'output-row'} ${DIGITS[index] === correctDigit ? 'correct' : ''}`;
    const label = document.createElement('span'); label.textContent = String(DIGITS[index]);
    const bar = document.createElement('div'); bar.className = 'bar';
    const fill = document.createElement('i'); fill.style.width = `${Math.round(value * 100)}%`; bar.appendChild(fill);
    const number = document.createElement('strong'); number.textContent = `${Math.round(value * 100)}%`;
    item.append(label, bar, number); return item;
  });
}

function renderFourImages() {
  const rows = samplesByDigit.map((group, index) => {
    const sample = group[fourStep % group.length];
    const outputs = forward(network, sample.pixels).at(-1);
    const row = document.createElement('div'); row.className = 'four-image-row';
    const digit = document.createElement('strong'); digit.className = 'four-digit'; digit.textContent = String(DIGITS[index]);
    const original = document.createElement('canvas'); original.width = 28; original.height = 28;
    original.title = `数字${sample.digit}の元画像 28×28`;
    image(original, sample.original, 28);
    const resized = document.createElement('canvas'); resized.width = 6; resized.height = 6;
    resized.title = `数字${sample.digit}の入力画像 6×6`;
    image(resized, sample.pixels, 6);
    const bars = document.createElement('div'); bars.className = 'four-bars';
    bars.append(...outputRows(outputs, sample.digit, true));
    row.append(digit, original, resized, bars);
    return row;
  });
  byId('four-image-rows').replaceChildren(...rows);
  return forward(network, samplesByDigit[0][fourStep % samplesByDigit[0].length].pixels);
}

function render() {
  if (!controls || !network || !samples.length) return;
  const fixedIndex = samples.findIndex(s => s.id === controls.fixedSampleId);
  if (fixedIndex >= 0) sampleIndex = fixedIndex;
  const teacherFixed = !!controls.fixedSampleId;
  const showFour = fourImages && !teacherFixed;
  byId('single-image').classList.toggle('hidden', showFour);
  byId('four-image-list').classList.toggle('hidden', !showFour);
  byId('sample-picker').classList.toggle('hidden', showFour);
  byId('four-images').disabled = teacherFixed;
  const sample = samples[sampleIndex], activations = showFour ? renderFourImages() : forward(network, sample.pixels);
  const outputs = activations.at(-1), labelIndex = DIGITS.indexOf(sample.digit);
  image(byId('original'), sample.original, 28);
  image(byId('resized'), sample.pixels, 6);
  byId('target').textContent = `${sample.digit}  [${DIGITS.map(d => Number(d === sample.digit)).join(', ')}]`;
  byId('loss').textContent = `誤差 ${fmt(-Math.log(Math.max(outputs[labelIndex], 1e-12)))}`;
  byId('outputs').replaceChildren(...outputRows(outputs, sample.digit));
  networkDiagram(byId('diagram'), network, activations, controls.student.weightId, controls);
  byId('diagram-note').textContent = showFour ? '中間層の数値は表示中の数字1の画像に対する活性値です。線にカーソルを重ねると重みが表示されます。' : '中間層の数値は現在の入力に対する活性値です。線にカーソルを重ねると重みが表示されます。';
  byId('assignment').textContent = controls.student.weightId ? `接続 ${controls.student.weightId}` : '担当待ち';
  byId('assignment-note').textContent = controls.student.weightId ? '金色の接続があなたの担当です。' : '現在は空いている重みがありません。ネットワークの観察はできます。';
  byId('version').textContent = String(weightVersion);
  byId('training-status').textContent = controls.trainingOn ? 'ON' : 'OFF';
  byId('sample-counter').textContent = showFour ? `${fourStep + 1} / ${Math.max(...samplesByDigit.map(group => group.length))}` : `${sampleIndex + 1} / ${samples.length}`;
  byId('sample-select').value = String(sampleIndex);
  byId('teacher-fixed').classList.toggle('hidden', !teacherFixed);
  for (const id of ['previous', 'next', 'sample-select']) byId(id).disabled = teacherFixed || autoSamples;
  const locked = controls.forceAutomatic || !controls.student.weightId;
  byId('mode-manual').disabled = locked;
  byId('mode-automatic').disabled = locked;
  byId('mode-manual').classList.toggle('active', controls.student.mode === 'manual');
  byId('mode-automatic').classList.toggle('active', controls.student.mode === 'automatic');
  byId('mode-note').textContent = controls.forceAutomatic ? '教員が自動モードを固定しています。' : controls.student.mode === 'automatic' ? '教員の自動学習がONのとき、サーバがこの重みを更新します。' : 'スライダーを動かすと、結果がすぐに変わります。';
  const value = assignedValue();
  byId('weight-value').textContent = value === null ? '—' : fmt(value);
  byId('weight-slider').disabled = locked || controls.student.mode !== 'manual';
  if (value !== null && !sending) byId('weight-slider').value = String(value);
}

async function refreshControls() {
  try {
    let latest;
    try { latest = await api('/api/controls'); }
    catch (error) {
      if (!error.message.includes('参加情報がありません')) throw error;
      const joined = await post('/api/join', {});
      latest = joined.controls;
      network = joined.weights.network;
      weightVersion = joined.weights.weightVersion;
      notify('授業がリセットされたため再参加しました');
    }
    const structureChanged = JSON.stringify(latest.sizes) !== JSON.stringify(network.sizes);
    if (!controls.fixedSampleId && latest.fixedSampleId) preTeacherSampleIndex = sampleIndex;
    if (controls.fixedSampleId && !latest.fixedSampleId && preTeacherSampleIndex !== null) {
      sampleIndex = preTeacherSampleIndex;
      preTeacherSampleIndex = null;
    }
    controls = latest;
    if (structureChanged) await refreshWeights();
    else render();
    byId('connection').textContent = '接続中';
  } catch (error) { byId('connection').textContent = '再接続中'; }
}

async function refreshWeights() {
  try {
    const latest = await api('/api/weights');
    if (latest.weightVersion >= weightVersion) {
      network = latest.network; weightVersion = latest.weightVersion;
      byId('sync-time').textContent = `最終取得 ${new Date().toLocaleTimeString('ja-JP')}`;
      render();
    }
  } catch (error) { notify(error.message, true); }
}

async function sendWeight() {
  if (sending || pendingValue === null) return;
  sending = true;
  while (pendingValue !== null) {
    const value = pendingValue; pendingValue = null;
    try {
      const result = await post('/api/weight', { value });
      weightVersion = Math.max(weightVersion, result.weightVersion);
    } catch (error) {
      notify(error.message, true);
      await refreshControls(); await refreshWeights();
      pendingValue = null;
    }
  }
  sending = false;
  render();
}

byId('previous').onclick = () => advanceSamples(-1);
byId('next').onclick = () => advanceSamples(1);
byId('sample-select').onchange = event => selectSample(Number(event.target.value));
byId('mode-manual').onclick = async () => { try { await post('/api/mode', { mode: 'manual' }); await refreshControls(); } catch (error) { notify(error.message, true); } };
byId('mode-automatic').onclick = async () => { try { await post('/api/mode', { mode: 'automatic' }); await refreshControls(); } catch (error) { notify(error.message, true); } };
byId('weight-slider').oninput = event => {
  const value = Number(event.target.value), [l, j, i] = controls.student.weightId.split(':').map(Number);
  network.layers[l].weights[j][i] = value;
  pendingValue = value;
  render();
  sendWeight();
};
byId('fetch-once').onclick = refreshWeights;
byId('auto-samples').onchange = event => {
  autoSamples = event.target.checked;
  clearInterval(sampleTimer);
  sampleTimer = autoSamples ? setInterval(() => {
    advanceSamples(1);
  }, 2000) : null;
  render();
};
byId('four-images').onchange = event => { fourImages = event.target.checked; fourStep = 0; render(); };
byId('show-guide').onclick = () => byId('student-guide').showModal();
byId('close-guide').onclick = () => byId('student-guide').close();
byId('finish-guide').onclick = () => byId('student-guide').close();
byId('student-guide').onclick = event => { if (event.target === byId('student-guide')) byId('student-guide').close(); };
init().catch(error => { byId('connection').textContent = '接続失敗'; notify(error.message, true); });
