/**
 * Import from moja-sites config/products.catalog.json into config/ seed files.
 *
 * Usage: npm run catalog:import-from-sites
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  convertSitesCatalog,
  sitesCatalogToLayout,
} from '../src/shop-catalog/sites-catalog-sync.util';
import type { SitesCatalog } from '../src/shop-catalog/sites-catalog.types';

const repoRoot = resolve(__dirname, '..');
const envPath = process.env.MOJA_SITES_CATALOG_PATH?.trim();
const sitesCatalogPath =
  envPath ?? resolve(repoRoot, '..', 'moja-sites', 'config', 'products.catalog.json');

const raw = readFileSync(sitesCatalogPath, 'utf-8');
const catalog = JSON.parse(raw) as SitesCatalog;
const products = convertSitesCatalog(catalog);
const layout = sitesCatalogToLayout(catalog);

const dataDir = resolve(repoRoot, 'config');
mkdirSync(dataDir, { recursive: true });
writeFileSync(
  resolve(dataDir, 'shop-catalog.products.json'),
  JSON.stringify(products, null, 2),
  'utf-8',
);
writeFileSync(
  resolve(dataDir, 'shop-catalog.layout.json'),
  JSON.stringify(layout, null, 2),
  'utf-8',
);
writeFileSync(
  resolve(dataDir, 'home-popular.json'),
  JSON.stringify(
    {
      productIds: catalog.homeFeaturedSlugs.slice(0, 5),
      maxLimit: 5,
    },
    null,
    2,
  ),
  'utf-8',
);

console.log(`Imported ${products.length} products from ${sitesCatalogPath}`);
console.log(`Wrote config/shop-catalog.products.json and layout (${layout.shopSections.length} sections)`);
