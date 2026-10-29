export const DIGITS = [1, 4, 7, 0];

export function makeNetwork(hidden = [3], random = Math.random) {
  if (![1, 2].includes(hidden.length) || hidden.some(n => !Number.isInteger(n) || n < 3 || n > 5)) throw new Error('中間層は1～2層、各3～5個です');
  const sizes = [36, ...hidden, 4];
  const layers = [];
  for (let l = 0; l < sizes.length - 1; l++) {
    const incoming = sizes[l], outgoing = sizes[l + 1];
    layers.push({
      weights: Array.from({ length: outgoing }, () => Array.from({ length: incoming }, () => (random() * 2 - 1) * Math.sqrt(2 / incoming))),
      biases: Array(outgoing).fill(0)
    });
  }
  return { sizes, layers };
}

export function weightIds(network) {
  const ids = [];
  network.layers.forEach((layer, l) => layer.weights.forEach((row, j) => row.forEach((_, i) => ids.push(`${l}:${j}:${i}`))));
  return ids;
}

export function getWeight(network, id) {
  const [l, j, i] = parseWeightId(network, id);
  return network.layers[l].weights[j][i];
}

export function setWeight(network, id, value) {
  const [l, j, i] = parseWeightId(network, id);
  network.layers[l].weights[j][i] = value;
}

export function parseWeightId(network, id) {
  if (!/^\d+:\d+:\d+$/.test(id)) throw new Error('重みIDが不正です');
  const parts = id.split(':').map(Number);
  const [l, j, i] = parts;
  if (!network.layers[l] || !Number.isFinite(network.layers[l].weights[j]?.[i])) throw new Error('重みIDが存在しません');
  return parts;
}

export function forward(network, input) {
  if (!Array.isArray(input) || input.length !== 36) throw new Error('入力は36成分です');
  const activations = [input];
  let values = input;
  network.layers.forEach((layer, l) => {
    const z = layer.weights.map((row, j) => row.reduce((sum, weight, i) => sum + weight * values[i], layer.biases[j]));
    values = l === network.layers.length - 1 ? softmax(z) : z.map(v => Math.tanh(v));
    activations.push(values);
  });
  return activations;
}

function softmax(values) {
  const max = Math.max(...values);
  const exps = values.map(v => Math.exp(v - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / total);
}

export function trainBatch(network, samples, learningRate, canUpdate) {
  if (!samples.length) return 0;
  const gradients = network.layers.map(layer => ({
    weights: layer.weights.map(row => row.map(() => 0)),
    biases: layer.biases.map(() => 0)
  }));
  let loss = 0;
  for (const sample of samples) {
    const a = forward(network, sample.pixels);
    const last = a.length - 1;
    const label = DIGITS.indexOf(sample.digit);
    if (label < 0) throw new Error('対象外の数字です');
    loss -= Math.log(Math.max(a[last][label], 1e-12));
    let delta = a[last].map((value, j) => value - Number(j === label));
    for (let l = network.layers.length - 1; l >= 0; l--) {
      const layer = network.layers[l];
      delta.forEach((d, j) => {
        gradients[l].biases[j] += d;
        a[l].forEach((input, i) => { gradients[l].weights[j][i] += d * input; });
      });
      if (l > 0) {
        const previous = Array(a[l].length).fill(0);
        delta.forEach((d, j) => layer.weights[j].forEach((weight, i) => { previous[i] += d * weight; }));
        delta = previous.map((value, i) => value * (1 - a[l][i] ** 2));
      }
    }
  }
  const scale = learningRate / samples.length;
  network.layers.forEach((layer, l) => {
    layer.weights.forEach((row, j) => row.forEach((value, i) => {
      if (canUpdate(`${l}:${j}:${i}`)) row[i] = value - scale * gradients[l].weights[j][i];
    }));
    layer.biases.forEach((value, j) => { layer.biases[j] = value - scale * gradients[l].biases[j]; });
  });
  return loss / samples.length;
}

export function addNeuron(network, hiddenIndex, random = Math.random) {
  if (!Number.isInteger(hiddenIndex) || hiddenIndex < 0 || hiddenIndex >= network.sizes.length - 2) throw new Error('中間層が不正です');
  if (network.sizes[hiddenIndex + 1] >= 5) throw new Error('中間層は最大5個です');
  const incoming = network.layers[hiddenIndex];
  const outgoing = network.layers[hiddenIndex + 1];
  const count = network.sizes[hiddenIndex];
  incoming.weights.push(Array.from({ length: count }, () => (random() * 2 - 1) * Math.sqrt(2 / count)));
  incoming.biases.push(0);
  outgoing.weights.forEach(row => row.push((random() * 2 - 1) * Math.sqrt(2 / (count + 1))));
  network.sizes[hiddenIndex + 1]++;
}
