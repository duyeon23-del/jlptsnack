import sharp from 'sharp';
import { stat } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const inputPath = join(root, 'public', 'yuki_coach.png');
const pngOut = join(root, 'public', 'yuki_coach.png');
const webpOut = join(root, 'public', 'yuki_coach.webp');

const MAX_EDGE = 400;

const meta = await sharp(inputPath).metadata();
const w = meta.width ?? MAX_EDGE;
const h = meta.height ?? MAX_EDGE;
const needsResize = w > MAX_EDGE || h > MAX_EDGE;

let pipeline = sharp(inputPath);
if (needsResize) {
  pipeline = pipeline.resize(MAX_EDGE, MAX_EDGE, {
    fit: 'inside',
    withoutEnlargement: true,
  });
}

const resized = await pipeline.toBuffer();

await sharp(resized).webp({ quality: 86, effort: 6 }).toFile(webpOut);
await sharp(resized).png({ compressionLevel: 9, effort: 10 }).toFile(pngOut);

const [webpStat, pngStat] = await Promise.all([stat(webpOut), stat(pngOut)]);
console.log('wrote', webpOut, `(${(webpStat.size / 1024).toFixed(1)} KiB)`);
console.log('wrote', pngOut, `(${(pngStat.size / 1024).toFixed(1)} KiB)`);
