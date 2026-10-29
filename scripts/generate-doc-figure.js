import { readFile, mkdir, writeFile } from 'node:fs/promises';

const samples = JSON.parse(await readFile(new URL('../data/observation.json', import.meta.url), 'utf8'));
const sample = samples.find(item => item.digit === 1) || samples[0];
const pixelRects = (values, size, x, y, scale) => values.map((value, index) => {
  const col = index % size;
  const row = Math.floor(index / size);
  return `<rect x="${x + col * scale}" y="${y + row * scale}" width="${scale}" height="${scale}" fill="rgb(${value},${value},${value})"/>`;
}).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 270" role="img" aria-label="MNISTの元画像を6×6に縮小して入力する図">
<rect width="620" height="270" rx="20" fill="#10272e"/>
<text x="24" y="34" fill="#eaf3f5" font-family="sans-serif" font-size="17" font-weight="bold">MNISTの数字 ${sample.digit} を入力に変換</text>
<rect x="24" y="56" width="168" height="168" rx="8" fill="#000"/>${pixelRects(sample.original, 28, 24, 56, 6)}
<text x="211" y="146" fill="#e8b34d" font-family="sans-serif" font-size="28">→</text>
<rect x="253" y="56" width="168" height="168" rx="8" fill="#000"/>${pixelRects(sample.pixels, 6, 253, 56, 28)}
<text x="440" y="146" fill="#e8b34d" font-family="sans-serif" font-size="28">→</text>
<text x="485" y="111" fill="#9fb9be" font-family="sans-serif" font-size="14">教師信号</text>
<text x="485" y="160" fill="#f3c66c" font-family="sans-serif" font-size="42" font-weight="bold">${sample.digit}</text>
<text x="24" y="251" fill="#9fb9be" font-family="sans-serif" font-size="14">元画像 28×28</text>
<text x="253" y="251" fill="#9fb9be" font-family="sans-serif" font-size="14">入力画像 6×6</text>
</svg>\n`;
const output = new URL('../docs/images/mnist-example.svg', import.meta.url);
await mkdir(new URL('../docs/images/', import.meta.url), { recursive: true });
await writeFile(output, svg);
console.log(output.pathname);
