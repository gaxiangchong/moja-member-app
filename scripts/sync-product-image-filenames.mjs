/**
 * Ensures lowercase catalog filenames exist on disk (Linux deploy) and copies
 * public/images into dist/ for hosts that only ship the build output.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'public', 'images', 'products');
const publicSrc = join(process.cwd(), 'public', 'images');
const publicDist = join(process.cwd(), 'dist', 'public', 'images');
if (existsSync(publicSrc)) {
  mkdirSync(join(process.cwd(), 'dist', 'public'), { recursive: true });
  cpSync(publicSrc, publicDist, { recursive: true });
  console.log('[sync-product-images] copied public/images → dist/public/images');
}

/** [source on disk, canonical lowercase name used in catalog] */
const ALIASES = [
  ['Jasmine_blanc.png', 'jasmine_blanc.png'],
  ['Jasmine_blanc.PNG', 'jasmine_blanc.png'],
];

for (const [from, to] of ALIASES) {
  const src = join(dir, from);
  const dst = join(dir, to);
  if (from === to) continue;
  if (existsSync(dst)) continue;
  if (existsSync(src)) {
    copyFileSync(src, dst);
    console.log(`[sync-product-images] created ${to} from ${from}`);
  }
}

if (!existsSync(join(dir, 'jasmine_blanc.png'))) {
  console.warn(
    '[sync-product-images] WARNING: jasmine_blanc.png still missing — add and commit public/images/products/jasmine_blanc.png',
  );
}
