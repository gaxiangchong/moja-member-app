import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Resolve public/images for dev (repo root) and prod (dist/ + repo root). */
export function resolvePublicImagesRoot(): string {
  const candidates = [
    process.env.PUBLIC_IMAGES_ROOT?.trim(),
    resolve(process.cwd(), 'public', 'images'),
    resolve(__dirname, '..', 'public', 'images'),
    resolve(__dirname, 'public', 'images'),
  ].filter((p): p is string => Boolean(p));

  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return resolve(process.cwd(), 'public', 'images');
}

/**
 * Linux paths are case-sensitive. Catalog may reference jasmine_blanc.png while
 * the committed file is Jasmine_blanc.png — resolve a case-insensitive match.
 */
export function resolveProductImageFile(filename: string): string | null {
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return null;
  }
  const productsDir = join(resolvePublicImagesRoot(), 'products');
  if (!existsSync(productsDir)) return null;

  const exact = join(productsDir, filename);
  if (existsSync(exact)) return exact;

  try {
    const lower = filename.toLowerCase();
    for (const name of readdirSync(productsDir)) {
      if (name.toLowerCase() === lower) return join(productsDir, name);
    }
  } catch {
    /* ignore */
  }
  return null;
}
