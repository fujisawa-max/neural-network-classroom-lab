import { api, post, byId, fmt } from './common.js';

let state;
let studentLinks = [];
const notify = (message, error = false) => {
  const box = byId('message'); box.textContent = message; box.classList.remove('hidden'); box.classList.toggle('error', error);
  clearTimeout(notify.timeout); notify.timeout = setTimeout(() => box.classList.add('hidden'), 5000);
};

function render() {
  if (!state) return;
  byId('students-count').textContent = String(state.students.length);
  byId('assigned-count').textContent = String(state.assignedCount);
  byId('epoch').textContent = String(state.epoch);
  byId('structure').textContent = `${state.network.sizes.join(' → ')}　${state.finalized ? '構成確定済み' : '初期化中'}`;
  byId('finalize').disabled = state.finalized;
  byId('training').checked = state.trainingOn;
  byId('loss').textContent = state.lastLoss === null ? '—' : fmt(state.lastLoss);
  byId('force-status').textContent = state.forceAutomatic ? '全員を自動に固定中。学生は変更できません。' : '学生が各自のモードを選べます。';
  byId('force-on').disabled = state.forceAutomatic;
  byId('force-off').disabled = !state.forceAutomatic;
  byId('fixed-status').textContent = state.fixedSampleId ? `固定中：${state.fixedSampleId}` : '現在、教員による固定はありません。';
  byId('unfix-sample').disabled = !state.fixedSampleId;
  byId('dataset-count').textContent = `サーバ学習用 ${state.trainingCount.toLocaleString()}件 ／ 学生観察用 ${state.observationCount}件`;
  byId('participants').replaceChildren(...state.students.map((student, index) => {
    const row = document.createElement('div'); row.className = 'participant';
    row.textContent = `${index + 1}番　${student.weightId || '担当なし'}　${student.weightId ? student.mode === 'manual' ? '手動' : '自動' : '閲覧のみ'}`;
    return row;
  }));
}

async function refresh() { state = await api('/api/state'); render(); }
async function action(name, extra = {}) { try { state = await post('/api/action', { action: name, ...extra }); render(); } catch (error) { notify(error.message, true); } }

byId('layer-count').onchange = () => byId('hidden-2-wrap').classList.toggle('hidden', byId('layer-count').value !== '2');
byId('configure').onclick = async () => {
  const hidden = [Number(byId('hidden-1').value)];
  if (byId('layer-count').value === '2') hidden.push(Number(byId('hidden-2').value));
  if (state.students.length && !confirm('参加中の学生がいます。構成を変更すると重みと担当を初期化します。続けますか？')) return;
  try { state = await post(state.students.length ? '/api/restart' : '/api/configure', { hidden }); render(); notify('構成を設定しました'); } catch (error) { notify(error.message, true); }
};
byId('restart').onclick = async () => {
  if (!confirm('参加割り当てと重みを初期化します。続けますか？')) return;
  const hidden = [Number(byId('hidden-1').value)];
  if (byId('layer-count').value === '2') hidden.push(Number(byId('hidden-2').value));
  try { state = await post('/api/restart', { hidden }); render(); notify('授業をリセットしました'); } catch (error) { notify(error.message, true); }
};
byId('finalize').onclick = () => action('finalize');
byId('force-on').onclick = () => action('force-on');
byId('force-off').onclick = () => action('force-off');
byId('training').onchange = event => action(event.target.checked ? 'training-on' : 'training-off');
byId('fix-sample').onclick = () => action('fix-sample', { id: byId('sample-select').value });
byId('unfix-sample').onclick = () => action('unfix-sample');

function showStudentLink(index) {
  const link = studentLinks[index];
  if (!link) return;
  byId('student-url').textContent = link.url;
  byId('student-url').href = link.url;
  const qr = window.qrcode(0, 'M');
  qr.addData(link.url);
  qr.make();
  byId('student-qr').innerHTML = qr.createSvgTag(8, 32);
  byId('student-link-note').textContent = `${link.interface}（${link.address}）を使用。学生の端末を同じネットワークに接続してください。`;
}

byId('show-student-info').onclick = async () => {
  const dialog = byId('student-info');
  dialog.showModal();
  byId('student-link-content').classList.add('hidden');
  byId('student-link-note').textContent = '接続先を確認しています…';
  try {
    const result = await api('/api/student-links');
    studentLinks = result.links;
    byId('address-picker').replaceChildren(...studentLinks.map((link, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${link.interface} — ${link.address}`;
      return option;
    }));
    byId('address-picker-wrap').classList.toggle('hidden', studentLinks.length < 2);
    if (!studentLinks.length) {
      byId('student-link-note').textContent = '学生から接続できるIPv4アドレスが見つかりません。サーバのネットワーク接続を確認してください。';
      return;
    }
    byId('student-link-content').classList.remove('hidden');
    showStudentLink(0);
  } catch (error) { byId('student-link-note').textContent = error.message; }
};
byId('address-picker').onchange = event => showStudentLink(Number(event.target.value));
byId('close-student-info').onclick = () => byId('student-info').close();
byId('student-info').onclick = event => { if (event.target === byId('student-info')) byId('student-info').close(); };

const observation = await api('/api/observation');
byId('sample-select').replaceChildren(...observation.samples.map((sample, index) => {
  const option = document.createElement('option'); option.value = sample.id; option.textContent = `${index + 1}. 数字 ${sample.digit}`; return option;
}));
refresh().catch(error => notify(error.message, true));
setInterval(() => refresh().catch(error => notify(error.message, true)), 1500);
