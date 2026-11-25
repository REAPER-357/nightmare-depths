// Build step: generates the PWA icons (www/icons/*.png). Generated files are git-ignored.
// The game itself is www/index.html - edited directly, never generated.
// Plain CSS lives in index.html, so there is no Tailwind step for this app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPNG } from './icons.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'www', 'icons');
fs.mkdirSync(out, { recursive: true });

const jobs = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['icon-180.png', 180],
];
for (const [name, size] of jobs) {
  fs.writeFileSync(path.join(out, name), renderPNG(size, 'full', false));
  console.log('[build] icons/' + name);
}
if (!fs.existsSync(path.join(root, 'www', 'index.html'))) {
  console.error('[build] www/index.html is missing');
  process.exit(1);
}
console.log('[build] done');
