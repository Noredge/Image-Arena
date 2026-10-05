// Synthetic calibration images, generated locally. No user artwork is read.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(process.argv[2] ?? 'test-results/fixtures');
mkdirSync(root, { recursive: true });
function crc32(b) { let c = 0xffffffff; for (const byte of b) { c ^= byte; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; }
function chunk(name, bytes) { const type = Buffer.from(name); const out = Buffer.alloc(bytes.length + 12); out.writeUInt32BE(bytes.length); type.copy(out, 4); bytes.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([type, bytes])), out.length - 4); return out; }
for (let n = 1; n <= 17; n++) {
  const w = n % 3 === 0 ? 640 : n % 3 === 1 ? 1000 : 720;
  const h = n % 3 === 0 ? 960 : n % 3 === 1 ? 640 : 720;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const at = y * (w * 3 + 1) + 1 + x * 3;
    const border = x < 9 || y < 9 || x > w - 10 || y > h - 10;
    const checker = ((Math.floor(x / 80) + Math.floor(y / 80)) % 2) * 22;
    raw[at] = border ? 245 : (45 + x / w * 100 + n * 7 + checker) % 230;
    raw[at + 1] = border ? 245 : (55 + y / h * 100 + n * 5 + checker) % 230;
    raw[at + 2] = border ? 245 : (75 + n * 9 + checker) % 230;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2;
  const image = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('tEXt', Buffer.from('prompt\0SYNTHETIC QA FIXTURE; original metadata must remain intact')), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  writeFileSync(resolve(root, `sample-${String(n).padStart(2, '0')}.png`), image);
}
writeFileSync(resolve(root, 'broken.png'), Buffer.from([137,80,78,71,13,10,26,10]));
writeFileSync(resolve(root, 'not-an-image.txt'), 'Deliberately unsupported test fixture.');
mkdirSync(resolve(root, 'same-name'), { recursive: true });
const { readFileSync } = await import('node:fs');
writeFileSync(resolve(root, 'same-name/sample-01.png'), readFileSync(resolve(root, 'sample-02.png')));
console.log(root);
