export const DIGITS = [1, 4, 7, 0];

export async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}

export const post = (path, data) => api(path, { method: 'POST', body: JSON.stringify(data) });
export const byId = id => document.getElementById(id);
export const fmt = n => Number.isFinite(n) ? n.toFixed(3) : '—';

export function forward(network, pixels) {
  let current = pixels.map(value => value / 255);
  const activations = [current];
  network.layers.forEach((layer, index) => {
    const z = layer.weights.map((row, j) => row.reduce((sum, weight, i) => sum + weight * current[i], layer.biases[j]));
    if (index === network.layers.length - 1) {
      const max = Math.max(...z);
      const exps = z.map(value => Math.exp(value - max));
      const total = exps.reduce((a, b) => a + b, 0);
      current = exps.map(value => value / total);
    } else current = z.map(Math.tanh);
    activations.push(current);
  });
  return activations;
}

export function image(canvas, pixels, size) {
  const context = canvas.getContext('2d');
  const bitmap = context.createImageData(size, size);
  pixels.forEach((value, i) => {
    bitmap.data[i * 4] = value;
    bitmap.data[i * 4 + 1] = value;
    bitmap.data[i * 4 + 2] = value;
    bitmap.data[i * 4 + 3] = 255;
  });
  const offscreen = document.createElement('canvas');
  offscreen.width = offscreen.height = size;
  offscreen.getContext('2d').putImageData(bitmap, 0, 0);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
}

export function networkDiagram(svg, network, activations, assignedId, modes = {}) {
  const width = 500, height = 320, marginX = 30, marginY = 24;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = '';
  const count = network.sizes.length;
  const point = (layer, neuron) => ({
    x: marginX + layer * (width - marginX - 80) / (count - 1),
    y: marginY + (neuron + 0.5) * (height - 2 * marginY) / network.sizes[layer]
  });
  const create = (tag, attrs, parent = svg) => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    parent.appendChild(element);
    return element;
  };
  for (let l = 0; l < network.layers.length; l++) {
    const layer = network.layers[l];
    layer.weights.forEach((row, j) => row.forEach((value, i) => {
      const id = `${l}:${j}:${i}`, a = point(l, i), b = point(l + 1, j), owned = id === assignedId;
      const line = create('line', {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        stroke: owned ? '#f6b73c' : value >= 0 ? '#3eb9c0' : '#ad6dbb',
        'stroke-width': owned ? 4.5 : Math.max(0.45, Math.min(2.8, Math.abs(value) * 1.25)),
        opacity: owned ? 1 : 0.25
      });
      create('title', {}, line).textContent = `${id}  重み ${fmt(value)}${owned ? '  あなたの担当' : ''}`;
      if (owned) line.setAttribute('stroke-dasharray', modes.forceAutomatic ? '6 4' : 'none');
    }));
  }
  network.sizes.forEach((size, l) => {
    const title = l === 0 ? '入力 36' : l === count - 1 ? '出力 4' : `中間 ${l}`;
    create('text', { x: point(l, 0).x, y: 16, 'text-anchor': 'middle', fill: '#a9c6d0', 'font-size': 12 }).textContent = title;
    for (let n = 0; n < size; n++) {
      const p = point(l, n), activation = activations?.[l]?.[n] || 0;
      create('circle', { cx: p.x, cy: p.y, r: l === 0 ? 3 : 12,
        fill: l === 0 ? `rgba(100,220,220,${Math.max(0.18, activation)})` : '#153746',
        stroke: '#79d9d7', 'stroke-width': l === 0 ? 0 : 1.8 });
      if (l > 0) create('text', { x: p.x, y: p.y + 3, 'text-anchor': 'middle', fill: '#eaf6f7', 'font-size': 8 }).textContent = fmt(activation);
      if (l === count - 1) {
        create('text', { x: p.x + 18, y: p.y + 5, fill: '#f3c66c', 'font-size': 16, 'font-weight': 800 }).textContent = `数字 ${DIGITS[n]}`;
      }
    }
  });
}
