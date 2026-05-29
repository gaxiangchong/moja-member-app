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

function writeCatalogFiles(
  dir: string,
  productJson: string,
  layoutJson: string,
  popularJson: string,
): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'shop-catalog.products.json'), productJson, 'utf-8');
  writeFileSync(resolve(dir, 'shop-catalog.layout.json'), layoutJson, 'utf-8');
  writeFileSync(resolve(dir, 'home-popular.json'), popularJson, 'utf-8');
}

const productJson = JSON.stringify(products, null, 2);
const layoutJson = JSON.stringify(layout, null, 2);
const popularJson = JSON.stringify(
  {
    productIds: catalog.homeFeaturedSlugs.slice(0, 5),
    maxLimit: 5,
  },
  null,
  2,
);

writeCatalogFiles(resolve(repoRoot, 'config'), productJson, layoutJson, popularJson);
writeCatalogFiles(resolve(repoRoot, 'data'), productJson, layoutJson, popularJson);

console.log(`Imported ${products.length} products from ${sitesCatalogPath}`);
console.log(
  `Wrote config/ and data/ shop-catalog.products.json, layout (${layout.shopSections.length} sections), home-popular.json`,
);
