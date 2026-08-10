import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import puppeteer from 'puppeteer-core';

const root = resolve(import.meta.dirname, '..');
const runs = Math.max(1, Number.parseInt(process.env.PERF_RUNS ?? '3', 10));
const outputDir = resolve(root, process.env.PERF_OUTPUT_DIR ?? 'reports/performance');
const chrome = process.env.CHROME_PATH ?? (process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : '/usr/bin/google-chrome');
const ports = { api: 4317, client: 4318, bento: 4319 };
const targets = [
  { id: 'client-home', app: 'client-web', url: `http://127.0.0.1:${ports.client}/?tab=home`, ready: 'nav.bottomTabs' },
  { id: 'client-shop-list', app: 'client-web', url: `http://127.0.0.1:${ports.client}/?tab=shop`, ready: '.shopProductHit' },
  { id: 'client-product-detail', app: 'client-web', url: `http://127.0.0.1:${ports.client}/?tab=shop`, ready: '.shopDetailCard', setup: '.shopProductHit' },
  { id: 'bento-landing', app: 'bento-web', url: `http://127.0.0.1:${ports.bento}/`, ready: '.landing' },
];
const thresholds = { lcpMs: 2500, cls: 0.1, inpMs: 200 };

function command(bin, args, env = {}) {
  return new Promise((ok, fail) => {
    const child = spawn(bin, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code) => code === 0 ? ok() : fail(new Error(`${bin} ${args.join(' ')} exited ${code}`)));
  });
}

function json(res, value) {
  const body = JSON.stringify(value);
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' });
  res.end(body);
}

function apiServer() {
  const profile = { id: 'perf-member', phoneE164: '+60123456789', status: 'ACTIVE', displayName: 'Performance Member', email: 'perf@example.test', birthday: null, memberTier: 'Gold', loyalty: { pointsBalance: 1280, walletId: 'perf-wallet' }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', referralCode: 'PERF', referralCount: 3, storedWallet: { walletId: 'perf-wallet', currentWalletBalance: 4200, lifetimeSpentAmount: 12000, lifetimeTopUpAmount: 16200 } };
  const products = [
    { id: 'cake-1', category: 'whole_cakes', categoryLabel: 'Whole cakes', name: 'Chocolate Celebration Cake', shortDescription: 'Rich chocolate cake', description: 'A rich chocolate cake for every celebration.', imageUrl: '', basePriceCents: 8900, variants: [{ id: 'v1', label: '6 inch', priceCents: 8900, available: true }] },
    { id: 'drink-1', category: 'drinks', categoryLabel: 'Drinks', name: 'Iced Matcha Latte', shortDescription: 'Ceremonial matcha', description: 'Smooth ceremonial matcha with fresh milk.', imageUrl: '', basePriceCents: 1600, variants: [] },
  ];
  return createServer((req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); return res.end(); }
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/customers/me') return json(res, profile);
    if (path === '/customers/me/rewards') return json(res, { wallet: { pointsBalance: 1280 }, vouchers: [], rewards: [] });
    if (path === '/home-ads/slides' || path === '/shop/catalog/popular') return json(res, []);
    if (path === '/shop/catalog/products') return json(res, products);
    if (path === '/bento/packages') return json(res, []);
    res.writeHead(404, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end('{"message":"performance fixture has no response for this route"}');
  });
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
function staticServer(directory) {
  return createServer(async (req, res) => {
    try {
      let file = join(directory, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      if (!(await stat(file).catch(() => null))?.isFile()) file = join(directory, 'index.html');
      res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
}

function listen(server, port) { return new Promise((ok, fail) => server.once('error', fail).listen(port, '127.0.0.1', ok)); }
function close(server) { return new Promise((ok) => server.close(ok)); }
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const round = (value, digits = 0) => Number(value.toFixed(digits));

async function measure(browser, target) {
  const page = await browser.newPage();
  const session = await page.createCDPSession();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await session.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8, connectionType: 'cellular4g' });
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluateOnNewDocument((app) => {
    if (app === 'client-web') localStorage.setItem('moja_access_token', 'performance-fixture-token');
    else { localStorage.removeItem('moja_access_token'); localStorage.removeItem('bento-known-member'); }
    window.__perf = { lcp: 0, cls: 0, inp: 0 };
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    try { new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__perf.inp = Math.max(window.__perf.inp, e.duration); }).observe({ type: 'event', buffered: true, durationThreshold: 16 }); } catch { /* Event Timing unavailable */ }
  }, target.app);
  await page.goto(target.url, { waitUntil: 'networkidle0', timeout: 45_000 });
  if (target.setup) { await page.waitForSelector(target.setup); await page.click(target.setup); }
  await page.waitForSelector(target.ready, { timeout: 15_000 });
  await page.click(target.ready).catch(() => {});
  await new Promise((ok) => setTimeout(ok, 1000));
  const metrics = await page.evaluate(() => ({ ...window.__perf }));
  await page.close();
  return { lcpMs: round(metrics.lcp), cls: round(metrics.cls, 4), inpMs: round(metrics.inp) };
}

function markdown(report) {
  const rows = report.pages.map((p) => `| ${p.id} | ${p.median.lcpMs} ms ${p.pass.lcp ? '✅' : '⚠️'} | ${p.median.cls} ${p.pass.cls ? '✅' : '⚠️'} | ${p.median.inpMs} ms ${p.pass.inp ? '✅' : '⚠️'} |`).join('\n');
  return `# Web performance baseline\n\nGenerated: ${report.generatedAt}\n\nProfile: mobile 390×844, 4× CPU slowdown, 1.6 Mbps down / 750 Kbps up, 150 ms latency. Values are median of ${report.runs} runs. Targets are advisory.\n\n| Page | LCP (< 2500 ms) | CLS (< 0.1) | INP (< 200 ms) |\n|---|---:|---:|---:|\n${rows}\n\nRaw samples and machine-readable pass flags are in \`baseline.json\`.\n`;
}

async function main() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  await command(npm, ['run', 'build', '--prefix', 'client-web'], { VITE_API_BASE_URL: `http://127.0.0.1:${ports.api}` });
  await command(npm, ['run', 'build', '--prefix', 'bento-web'], { VITE_API_BASE_URL: `http://127.0.0.1:${ports.api}` });
  const servers = [apiServer(), staticServer(join(root, 'client-web/dist')), staticServer(join(root, 'bento-web/dist'))];
  await Promise.all(servers.map((server, i) => listen(server, [ports.api, ports.client, ports.bento][i])));
  try {
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const pages = [];
    try {
      for (const target of targets) {
        const samples = [];
        for (let i = 0; i < runs; i += 1) samples.push(await measure(browser, target));
        const med = { lcpMs: median(samples.map((x) => x.lcpMs)), cls: median(samples.map((x) => x.cls)), inpMs: median(samples.map((x) => x.inpMs)) };
        pages.push({ id: target.id, app: target.app, samples, median: med, pass: { lcp: med.lcpMs < thresholds.lcpMs, cls: med.cls < thresholds.cls, inp: med.inpMs < thresholds.inpMs } });
      }
    } finally { await browser.close(); }
    const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), runs, profile: { viewport: '390x844', cpuSlowdown: 4, latencyMs: 150, downloadKbps: 1600, uploadKbps: 750 }, thresholds, pages };
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'baseline.json'), `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(join(outputDir, 'baseline.md'), markdown(report));
    console.log(markdown(report));
  } finally { await Promise.all(servers.map(close)); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
