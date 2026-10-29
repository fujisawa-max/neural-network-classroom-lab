import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { DIGITS } from '../lib/network.js';

const source = 'https://storage.googleapis.com/cvdf-datasets/mnist/';
const names = ['train-images-idx3-ubyte.gz', 'train-labels-idx1-ubyte.gz'];
const selectedPerDigit = Number(process.env.OBSERVATION_PER_DIGIT || 25);
if (!Number.isInteger(selectedPerDigit) || selectedPerDigit < 1) throw new Error('OBSERVATION_PER_DIGITは正の整数です');
await mkdir('data', { recursive: true });

async function obtain(name) {
  const path = `data/${name}`;
  try { return await readFile(path); } catch {}
  console.log(`Downloading ${name}`);
  const response = await fetch(source + name);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path, bytes);
  return bytes;
}

const [imageGz, labelGz] = await Promise.all(names.map(obtain));
const images = gunzipSync(imageGz), labels = gunzipSync(labelGz);
if (images.readUInt32BE(0) !== 2051 || labels.readUInt32BE(0) !== 2049) throw new Error('MNIST IDX形式が不正です');
const count = images.readUInt32BE(4);
if (labels.readUInt32BE(4) !== count || images.readUInt32BE(8) !== 28 || images.readUInt32BE(12) !== 28) throw new Error('MNISTの件数または画像サイズが不正です');

function resize(sourcePixels) {
  const output = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
    // Area average retains the overall stroke when reducing 28x28 to 6x6.
    let sum = 0, area = 0;
    for (let sy = Math.floor(y * 28 / 6); sy < Math.ceil((y + 1) * 28 / 6); sy++) {
      const overlapY = Math.max(0, Math.min(sy + 1, (y + 1) * 28 / 6) - Math.max(sy, y * 28 / 6));
      for (let sx = Math.floor(x * 28 / 6); sx < Math.ceil((x + 1) * 28 / 6); sx++) {
        const overlapX = Math.max(0, Math.min(sx + 1, (x + 1) * 28 / 6) - Math.max(sx, x * 28 / 6));
        const weight = overlapX * overlapY;
        sum += sourcePixels[sy * 28 + sx] * weight;
        area += weight;
      }
    }
    output.push(Math.round(sum / area));
  }
  return output;
}

const training = [];
const observation = [];
const observed = new Map(DIGITS.map(d => [d, 0]));
for (let index = 0; index < count; index++) {
  const digit = labels[8 + index];
  if (!DIGITS.includes(digit)) continue;
  const original = Array.from(images.subarray(16 + index * 784, 16 + (index + 1) * 784));
  const resized = resize(original);
  training.push({ digit, pixels: resized });
  if (observed.get(digit) < selectedPerDigit) {
    observation.push({ id: `mnist-${index}`, digit, pixels: resized, original });
    observed.set(digit, observed.get(digit) + 1);
  }
}
if (DIGITS.some(d => observed.get(d) !== selectedPerDigit)) throw new Error('観察用データが不足しています');
await writeFile('data/training.json', JSON.stringify(training));
await writeFile('data/observation.json', JSON.stringify(observation));
await writeFile('data/manifest.json', JSON.stringify({ version: 1, trainingCount: training.length, observationCount: observation.length, digits: DIGITS, resize: 'area-average-28-to-6' }));
console.log(`Prepared ${training.length} training and ${observation.length} observation samples`);
