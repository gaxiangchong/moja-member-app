/**
 * Quick connectivity + schema check for the SalesPlay customer API.
 *
 * Usage (from repo root, after adding SALESPLAY_ACCESS_TOKEN to .env):
 *   npx ts-node scripts/test-salesplay-customer.ts
 *
 * It posts ONE sample customer and prints the HTTP status + raw response body,
 * so we can confirm the exact accepted field names and fix buildPayload().
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      out[m[1]] = val;
    }
  } catch {
    /* ignore */
  }
  return out;
}

async function main() {
  const env = { ...loadEnv(), ...process.env } as Record<string, string>;
  const token = (env.SALESPLAY_ACCESS_TOKEN ?? '').trim();
  const base =
    (env.SALESPLAY_API_BASE ?? '').trim().replace(/\/$/, '') ||
    'https://api.salesplaypos.com/v1.0';

  if (!token) {
    console.error('SALESPLAY_ACCESS_TOKEN is empty in .env — paste it first.');
    process.exit(1);
  }

  const phone = `+6012${String(Date.now()).slice(-7)}`;
  const sample = {
    first_name: 'Moja',
    last_name: 'Test',
    email: `moja.test+${Date.now()}@example.com`,
    phone_number: phone,
    country: env.SALESPLAY_DEFAULT_COUNTRY?.trim() || 'Malaysia',
    customer_code: phone.replace(/[^0-9A-Za-z._]/g, ''),
  };

  const url = `${base}/customers`;
  console.log('POST', url);
  console.log('Body:', JSON.stringify(sample, null, 2));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: '*/*',
    },
    body: JSON.stringify(sample),
  });

  const text = await res.text();
  console.log('\nStatus:', res.status, res.statusText);
  console.log('Response:\n', text);
}

void main();
