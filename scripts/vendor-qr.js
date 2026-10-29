import { mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const version = '1.4.4';
const response = await fetch(`https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-${version}.tgz`);
if (!response.ok) throw new Error(`QR library download: HTTP ${response.status}`);
const tar = gunzipSync(Buffer.from(await response.arrayBuffer()));
await mkdir('public/vendor', { recursive: true });
const wanted = new Map([
  ['package/qrcode.js', 'public/vendor/qrcode.js']
]);
for (let offset = 0; offset + 512 <= tar.length;) {
  const header = tar.subarray(offset, offset + 512);
  const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
  if (!name) break;
  const size = Number.parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim(), 8) || 0;
  const content = tar.subarray(offset + 512, offset + 512 + size);
  if (wanted.has(name)) {
    await writeFile(wanted.get(name), content);
    wanted.delete(name);
    console.log(`Vendored ${name}`);
  }
  offset += 512 + Math.ceil(size / 512) * 512;
}
if (wanted.size) throw new Error(`Missing: ${[...wanted.keys()].join(', ')}`);
await writeFile('public/vendor/qrcode-LICENSE', `QR Code Generator for JavaScript\nCopyright (c) 2009 Kazuhiko Arase\n\nThe MIT License (MIT)\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`);
