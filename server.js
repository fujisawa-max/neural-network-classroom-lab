import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { Classroom, UserError } from './lib/classroom.js';

const studentPort = Number(process.env.STUDENT_PORT || 80);
const teacherPort = Number(process.env.TEACHER_PORT || 8880);
const studentHost = process.env.STUDENT_HOST || '0.0.0.0';
const teacherHost = '127.0.0.1';
let training, observation, manifest;
try {
  [training, observation, manifest] = await Promise.all(['training', 'observation', 'manifest'].map(async name => JSON.parse(await readFile(new URL(`./data/${name}.json`, import.meta.url), 'utf8'))));
} catch {
  console.error('MNISTデータがありません。先に npm run prepare-data を実行してください。');
  process.exit(1);
}
const room = new Classroom(training, observation);
const sessions = new Map();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function json(res, value, status = 200, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}

async function body(req) {
  let value = '';
  for await (const part of req) {
    value += part;
    if (value.length > 20000) throw new UserError(413, '送信データが大きすぎます');
  }
  try { return value ? JSON.parse(value) : {}; } catch { throw new UserError(400, 'JSONが不正です'); }
}

function session(req, res) {
  const cookie = req.headers.cookie?.match(/(?:^|;\s*)nn_session=([a-f0-9]{32})/);
  const existing = cookie && sessions.get(cookie[1]);
  if (existing) return existing;
  const id = randomBytes(16).toString('hex');
  sessions.set(id, id);
  res.setHeader('Set-Cookie', `nn_session=${id}; HttpOnly; SameSite=Lax; Path=/`);
  return id;
}

async function staticFile(res, file) {
  const data = await readFile(new URL(`./public/${file}`, import.meta.url));
  const ext = file.slice(file.lastIndexOf('.'));
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(data);
}

function studentLinks() {
  const links = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const entry of addresses || []) {
      if (entry.family !== 'IPv4' || entry.internal || entry.address.startsWith('169.254.')) continue;
      const url = `http://${entry.address}${studentPort === 80 ? '' : `:${studentPort}`}/`;
      links.push({ interface: name, address: entry.address, url });
    }
  }
  links.sort((a, b) => {
    const score = item => /virtual|vethernet|wsl|docker|vpn|loopback/i.test(item.interface) ? 2 : /wi-?fi|wlan|ethernet|イーサネット/i.test(item.interface) ? 0 : 1;
    return score(a) - score(b) || a.interface.localeCompare(b.interface);
  });
  return links;
}

async function handle(req, res, teacher) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    if (req.method === 'GET' && path === '/') return await staticFile(res, teacher ? 'teacher.html' : 'student.html');
    if (req.method === 'GET' && ['/common.js', '/student.js', '/teacher.js', '/style.css', '/vendor/qrcode.js'].includes(path)) return await staticFile(res, path.slice(1));
    if (teacher) {
      if (req.method === 'GET' && path === '/api/student-links') return json(res, { links: studentLinks() });
      if (req.method === 'GET' && path === '/api/state') return json(res, room.teacherState());
      if (req.method === 'GET' && path === '/api/observation') return json(res, { samples: observation.map(({ id, digit }) => ({ id, digit })) });
      if (req.method === 'POST' && path === '/api/configure') return json(res, room.configure(await body(req)));
      if (req.method === 'POST' && path === '/api/restart') return json(res, room.restart((await body(req)).hidden));
      if (req.method === 'POST' && path === '/api/action') {
        const { action, ...payload } = await body(req);
        return json(res, room.teacherAction(action, payload));
      }
    } else {
      if (req.method === 'POST' && path === '/api/join') {
        const id = session(req, res);
        const student = room.join(id);
        return json(res, { student: { weightId: student.weightId, mode: student.mode }, controls: room.controls(id), weights: room.weights(), manifest });
      }
      if (req.method === 'GET' && path === '/api/observation') {
        const id = session(req, res); room.join(id);
        return json(res, { version: manifest.version, samples: observation });
      }
      if (req.method === 'GET' && path === '/api/controls') return json(res, room.controls(session(req, res)));
      if (req.method === 'GET' && path === '/api/weights') { room.student(session(req, res)); return json(res, room.weights()); }
      if (req.method === 'POST' && path === '/api/mode') {
        const { mode } = await body(req);
        const student = room.setMode(session(req, res), mode);
        return json(res, { mode: student.mode, controlVersion: room.controlVersion });
      }
      if (req.method === 'POST' && path === '/api/weight') {
        const { value } = await body(req);
        return json(res, room.changeWeight(session(req, res), value));
      }
    }
    return json(res, { error: '見つかりません' }, 404);
  } catch (error) {
    if (error.code === 'ENOENT') return json(res, { error: '見つかりません' }, 404);
    if (!(error instanceof UserError)) console.error(error);
    return json(res, { error: error.message || 'サーバエラー' }, error.status || 500);
  }
}

http.createServer((req, res) => handle(req, res, false)).listen(studentPort, studentHost, () => console.log(`Student: http://localhost:${studentPort}`));
http.createServer((req, res) => handle(req, res, true)).listen(teacherPort, teacherHost, () => console.log(`Teacher: http://localhost:${teacherPort}`));
setInterval(() => { try { room.tick(); } catch (error) { console.error('Training failed:', error); room.trainingOn = false; room.controlVersion++; } }, 100);
