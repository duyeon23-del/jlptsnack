import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'public', 'icon.svg');

const targets = [
  ['favicon-32.png', 32],
  ['apple-touch-icon.png', 180],
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
];

for (const [name, size] of targets) {
  await sharp(svgPath, { density: 320 })
    .resize(size, size)
    .png()
    .toFile(join(root, 'public', name));
  console.log('wrote', name, size);
}
