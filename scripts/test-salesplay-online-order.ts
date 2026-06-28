/**
 * Quick connectivity check for the SalesPlay online_orders API.
 *
 * Usage (from repo root, after configuring SalesPlay vars in .env):
 *   npx ts-node scripts/test-salesplay-online-order.ts
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
  const shopId = (env.SALESPLAY_SHOP_ID ?? '').trim();
  const base =
    (env.SALESPLAY_API_BASE ?? '').trim().replace(/\/$/, '') ||
    'https://api.salesplaypos.com/v1.0';

  if (!token) {
    console.error('SALESPLAY_ACCESS_TOKEN is empty in .env — paste it first.');
    process.exit(1);
  }
  if (!shopId) {
    console.error('SALESPLAY_SHOP_ID is empty in .env — set your SalesPlay shop id.');
    process.exit(1);
  }

  const now = new Date();
  const orderRef = `test-${Date.now()}`;
  const sample = {
    shop_id: shopId,
    order_date: now.toISOString().slice(0, 10),
    order_date_time: now.toISOString().slice(0, 19).replace('T', ' '),
    order_reference_number: orderRef,
    order_reference_id: orderRef,
    order_total: 18.9,
    channel_order_status_id: 0,
    channel_order_status_name: 'pending',
    order_type: env.SALESPLAY_ORDER_TYPE?.trim() || 'Pickup',
    customer_first_name: 'Moja',
    customer_last_name: 'Test',
    customer_phone: '+60123456789',
    customer_email: `moja.test+${Date.now()}@example.com`,
    order_items: [
      {
        product_code: 'TEST-PRODUCT',
        product_name: 'Test product',
        product_qty: 1,
        product_unit_price: 18.9,
        product_price: 18.9,
      },
    ],
    order_payments: [
      {
        payment_type: env.SALESPLAY_PAYMENT_TYPE?.trim() || 'Online',
        payment_amount: '18.90',
        is_advance: 0,
      },
    ],
  };

  const url = `${base}/online_orders`;
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
