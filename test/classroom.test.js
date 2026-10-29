import test from 'node:test';
import assert from 'node:assert/strict';
import { Classroom } from '../lib/classroom.js';
import { forward, getWeight, makeNetwork, trainBatch, weightIds } from '../lib/network.js';

const sample = digit => ({ digit, pixels: Array(36).fill(digit === 1 ? 1 : 0) });

test('network shapes and forward probabilities', () => {
  const network = makeNetwork([3, 4], () => 0.75);
  assert.deepEqual(network.sizes, [36, 3, 4, 4]);
  assert.equal(weightIds(network).length, 36 * 3 + 3 * 4 + 4 * 4);
  const output = forward(network, Array(36).fill(0)).at(-1);
  assert.ok(Math.abs(output.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

test('students receive distinct weights and growth reaches 150 seats', () => {
  const observation = [{ digit: 1, pixels: Array(36).fill(255), id: 'active' }];
  const room = new Classroom([sample(1)], observation, () => 0.75);
  const assigned = [];
  for (let i = 0; i < 150; i++) assigned.push(room.join(`student-${i}`).weightId);
  assert.equal(new Set(assigned).size, 150);
  assert.deepEqual(room.network.sizes, [36, 4, 4]);
  assert.equal(room.owners.size, 150);
  room.teacherAction('finalize');
  for (let i = 150; i < 160; i++) room.join(`student-${i}`);
  assert.deepEqual(room.network.sizes, [36, 4, 4]);
});

test('assignment skips input pixels that are always dark in observation data', () => {
  const pixels = Array(36).fill(255);
  pixels[0] = 0;
  const room = new Classroom([sample(1)], [{ id: 'one', digit: 1, pixels }], () => 0.75);
  for (let i = 0; i < 150; i++) {
    const assigned = room.join(`student-${i}`).weightId;
    assert.ok(assigned);
    assert.ok(!assigned.startsWith('0:') || !assigned.endsWith(':0'));
  }
});

test('manual weights stay fixed during training and teacher lock is enforced', () => {
  const room = new Classroom([sample(1), sample(4)], [{ ...sample(1), id: 'active' }], () => 0.75);
  const student = room.join('alice');
  const manualValue = getWeight(room.network, student.weightId);
  room.teacherAction('training-on');
  room.tick();
  assert.equal(getWeight(room.network, student.weightId), manualValue);
  room.setMode('alice', 'automatic');
  room.tick();
  assert.notEqual(getWeight(room.network, student.weightId), manualValue);
  room.teacherAction('force-on');
  assert.throws(() => room.setMode('alice', 'manual'), /教員/);
  assert.throws(() => room.changeWeight('alice', 0), /手動操作/);
  room.teacherAction('force-off');
  room.setMode('alice', 'manual');
  room.changeWeight('alice', 0.42);
  assert.equal(getWeight(room.network, student.weightId), 0.42);
  room.teacherAction('training-off');
  room.tick();
  assert.equal(getWeight(room.network, student.weightId), 0.42);
});

test('training lowers loss on a simple repeated class', () => {
  const network = makeNetwork([3], () => 0.5);
  const observations = Array.from({ length: 16 }, () => sample(1));
  const before = -Math.log(forward(network, observations[0].pixels).at(-1)[0]);
  for (let i = 0; i < 30; i++) trainBatch(network, observations, 0.3, () => true);
  const after = -Math.log(forward(network, observations[0].pixels).at(-1)[0]);
  assert.ok(after < before, `${before} -> ${after}`);
});
