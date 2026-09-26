#!/usr/bin/env node
/**
 * End-to-end loyalty & rewards journey against a running API (local/staging only).
 *
 * Required API env for the full run:
 *   PAYMENTS_DEMO_MODE=true  OTP_DELIVERY_MODE=mock  OTP_MOCK_FIXED_CODE=123456
 *   BIRTHDAY_REWARD_POINTS=200  REFERRAL_REWARD_POINTS=500
 *   SALESPLAY_WEBHOOK_TOKEN=<same as JOURNEY_SALESPLAY_TOKEN>
 *
 * Usage:
 *   JOURNEY_API=http://localhost:3154 JOURNEY_ADMIN_KEY=local-admin-key \
 *   JOURNEY_SALESPLAY_TOKEN=test-token node scripts/loyalty-journey.mjs
 *
 * The birthday voucher step runs the daily 9am campaign sweep in-process, so
 * build first (`npm run build`) and point DATABASE_URL at the same database.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const API = (process.env.JOURNEY_API || 'http://localhost:3154').replace(/\/$/, '');
const ADMIN_KEY = process.env.JOURNEY_ADMIN_KEY || 'local-admin-key';
const SP_TOKEN = process.env.JOURNEY_SALESPLAY_TOKEN || 'test-token';
const OTP = process.env.JOURNEY_OTP || '123456';
const PIN = '246810';
const RUN = Date.now().toString(36).slice(-5).toUpperCase();

const results = [];
function record(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? ` — ${detail}` : ''}`);
}

async function call(method, path, { body, token, admin } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (admin) headers['x-admin-api-key'] = ADMIN_KEY;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = typeof data === 'object' && data ? data.message || data.code : data;
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(msg)}`);
  }
  return data;
}

async function step(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (err) {
    record(name, false, err instanceof Error ? err.message : String(err));
  }
}

function randomPhone() {
  return '011' + String(Math.floor(10_000_000 + Math.random() * 89_999_999));
}

async function signUp(label, { referralCode, birthday } = {}) {
  const phone = randomPhone();
  const email = `${label.toLowerCase()}.${RUN}@example.com`;
  await call('POST', '/auth/otp/request', { body: { phone, purpose: 'register', email } });
  const verify = await call('POST', '/auth/otp/verify', {
    body: { phone, code: OTP, email, ...(referralCode ? { referralCode } : {}) },
  });
  const pin = await call('POST', '/auth/pin/set-initial', {
    body: { setupToken: verify.setupToken, pin: PIN, pinConfirm: PIN },
  });
  const token = pin.accessToken;
  await call('PATCH', '/customers/me', {
    token,
    body: {
      displayName: `${label} ${RUN}`,
      email,
      ...(birthday ? { birthday } : {}),
    },
  });
  const me = await call('GET', '/customers/me', { token });
  return { phone, email, token, id: me.id, referralCode: me.referralCode };
}

async function points(member) {
  const me = await call('GET', '/customers/me', { token: member.token });
  return me.loyalty?.pointsBalance ?? 0;
}

async function campaignVouchers(member) {
  const wallet = await call('GET', '/rewards-wallet/me', { token: member.token });
  return wallet.vouchers ?? [];
}

/** Campaign vouchers are issued in the background after an order; poll briefly. */
async function waitForVoucher(member, match, timeoutMs = 5000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const found = (await campaignVouchers(member)).find(match);
    if (found || Date.now() > until) return found;
    await new Promise((r) => setTimeout(r, 250));
  }
}

const fromCampaign = (campaign, nameHint) => (v) =>
  (campaign?.id && v.voucherCampaignId === campaign.id) ||
  (v.name ?? '').includes(nameHint);

let cachedPickup;
async function pickup() {
  if (cachedPickup) return cachedPickup;
  for (let i = 1; i <= 14; i += 1) {
    const d = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10);
    const day = await call('GET', `/shop/pickup-slots?date=${d}`);
    const slot = (day.slots || []).find((s) => s.available);
    if (!day.closed && slot) {
      cachedPickup = { date: d, slot: slot.start };
      return cachedPickup;
    }
  }
  throw new Error('No open pickup slot in the next 14 days.');
}

let cachedProduct;
async function product() {
  if (cachedProduct) return cachedProduct;
  const list = await call('GET', '/shop/catalog/products');
  const products = Array.isArray(list) ? list : list.products;
  for (const p of products) {
    const v = (p.variants || []).find((x) => x.available && x.priceCents > 0);
    if (p.isActive !== false && !p.soldOut && v) {
      cachedProduct = { id: p.id, name: p.name, variantLabel: v.label, priceCents: v.priceCents };
      return cachedProduct;
    }
  }
  throw new Error('No purchasable product found.');
}

/** Places and demo-pays a pickup order. Returns the order summary from checkout. */
async function buy(member, { qty = 1, voucherId, rewardDefinitionId } = {}) {
  const p = await product();
  const slot = await pickup();
  const subtotal = p.priceCents * qty;
  const created = await call('POST', '/payments/xendit/shop-order', {
    token: member.token,
    body: {
      channelCode: 'TOUCHNGO',
      idempotencyKey: `journey-${RUN}-${Math.random().toString(36).slice(2)}`,
      ...(voucherId ? { voucherId } : {}),
      ...(rewardDefinitionId ? { rewardDefinitionId } : {}),
      order: {
        totalCents: subtotal,
        fulfilmentType: 'PICKUP',
        scheduledDate: slot.date,
        scheduledSlot: slot.slot,
        lines: [
          {
            productId: p.id,
            name: p.name,
            variantLabel: p.variantLabel,
            unitPriceCents: p.priceCents,
            qty,
          },
        ],
      },
    },
  });
  if (!created.orderId) throw new Error(`Checkout returned no orderId: ${JSON.stringify(created)}`);
  await call('POST', '/payments/demo/complete-shop-order', {
    token: member.token,
    body: { orderId: created.orderId },
  });
  return { ...created, subtotal, discountCents: subtotal - created.totalCents };
}

async function runCampaignSweep() {
  const dist = resolve(process.cwd(), 'dist');
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import(pathToFileURL(resolve(dist, 'app.module.js')).href);
  const { CampaignAutomationService } = await import(
    pathToFileURL(resolve(dist, 'rewards-workflow/campaign-automation.service.js')).href
  );
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    await app.get(CampaignAutomationService).runDailySweep();
  } finally {
    await app.close();
  }
}

const iso = (ms) => new Date(Date.now() + ms).toISOString();
const DAY = 86_400_000;

async function main() {
  console.log(`Loyalty journey run ${RUN} against ${API}\n`);
  const todayUtc = new Date().toISOString().slice(0, 10);
  const birthdayToday = `1990-${todayUtc.slice(5)}`;

  // --- Admin setup -----------------------------------------------------------
  let rewardCampaign;
  let reward;
  let pointsDefinition;
  let bonusCampaign;
  await step('Admin: create points reward (RM10 voucher for 100 pts)', async () => {
    rewardCampaign = await call('POST', '/admin/campaigns', {
      admin: true,
      body: {
        template: 'CUSTOM',
        name: `Journey RM10 reward ${RUN}`,
        voucherType: 'FIXED_AMOUNT',
        discountAmountRM: 10,
        trigger: { type: 'POINTS_REDEEM' },
        startsAt: iso(-DAY),
        voucherValidDays: 30,
        pointsCost: 100,
      },
    });
    reward = await call('POST', '/admin/rewards-workflow/reward-catalog', {
      admin: true,
      body: {
        code: `JRN-RM10-${RUN}`,
        name: `RM10 off (journey ${RUN})`,
        rewardType: 'DISCOUNT_VOUCHER',
        pointsCost: 100,
        voucherCampaignId: rewardCampaign.id,
        isActive: true,
        visibleInRewardsWallet: true,
      },
    });
    return `campaign ${rewardCampaign.code ?? rewardCampaign.id}, reward ${reward.code}`;
  });
  await step('Admin: create points-catalog item redeemable at checkout (RM5 for 50 pts)', async () => {
    pointsDefinition = await call('POST', '/admin/voucher-definitions', {
      admin: true,
      body: {
        code: `JRN-RM5-${RUN}`,
        title: `RM5 off (journey ${RUN})`,
        pointsCost: 50,
        rebateValueSen: 500,
        showInRewardsCatalog: true,
      },
    });
    return pointsDefinition.code;
  });
  await step('Admin: create bonus campaign (RM15 voucher on RM100+ order, this week)', async () => {
    bonusCampaign = await call('POST', '/admin/campaigns', {
      admin: true,
      body: {
        template: 'SPEND_EARN',
        name: `Journey spend bonus ${RUN}`,
        voucherType: 'FIXED_AMOUNT',
        discountAmountRM: 15,
        minSpendRM: 0,
        trigger: { type: 'AUTO', criteria: 'MIN_PURCHASE', thresholdValue: 100 },
        startsAt: iso(-60_000),
        endsAt: iso(7 * DAY),
        voucherValidDays: 30,
      },
    });
    await call('POST', '/admin/campaigns', {
      admin: true,
      body: {
        template: 'SPEND_EARN',
        name: `Journey future bonus ${RUN}`,
        voucherType: 'FIXED_AMOUNT',
        discountAmountRM: 99,
        minSpendRM: 0,
        trigger: { type: 'AUTO', criteria: 'MIN_PURCHASE', thresholdValue: 100 },
        startsAt: iso(3 * DAY),
        endsAt: iso(10 * DAY),
      },
    });
    return 'plus a future-dated campaign that must not issue yet';
  });
  let birthdayCampaign;
  let referralCampaign;
  await step('Admin: create birthday and referral voucher campaigns', async () => {
    birthdayCampaign = await call('POST', '/admin/campaigns', {
      admin: true,
      body: {
        template: 'BIRTHDAY',
        name: `Journey birthday ${RUN}`,
        voucherType: 'FIXED_AMOUNT',
        discountAmountRM: 20,
        minSpendRM: 0,
        trigger: { type: 'AUTO', criteria: 'BIRTHDAY' },
        startsAt: iso(-DAY),
        voucherValidDays: 30,
      },
    });
    referralCampaign = await call('POST', '/admin/campaigns', {
      admin: true,
      body: {
        template: 'REFERRAL',
        name: `Journey referral ${RUN}`,
        voucherType: 'FIXED_AMOUNT',
        discountAmountRM: 8,
        minSpendRM: 0,
        trigger: { type: 'AUTO', criteria: 'REFERRAL_COUNT', thresholdValue: 1 },
        startsAt: iso(-DAY),
        voucherValidDays: 30,
      },
    });
    return 'RM20 birthday, RM8 after 1 referral';
  });

  // --- Member earns points ---------------------------------------------------
  let alice;
  await step('Member signs up (OTP + PIN) with birthday today', async () => {
    alice = await signUp('Alice', { birthday: birthdayToday });
    return `${alice.phone}, referral code ${alice.referralCode}`;
  });
  if (!alice) return;

  const p = await product().catch(() => null);
  await step('Online purchase earns points (1 pt per RM)', async () => {
    const before = await points(alice);
    const order = await buy(alice);
    const after = await points(alice);
    const expected = Math.floor(order.subtotal / 100);
    const birthdayPts = before === 0 && after - before === expected + 200 ? 200 : 0;
    if (after - before - birthdayPts !== expected) {
      throw new Error(`expected +${expected}, got +${after - before}`);
    }
    return `RM${(order.subtotal / 100).toFixed(2)} ${p?.name ?? ''} → +${expected} pts (balance ${after})`;
  });

  await step('Bonus campaign issues voucher for RM100+ order within the period', async () => {
    const bonus = await waitForVoucher(alice, fromCampaign(bonusCampaign, `spend bonus ${RUN}`));
    const vouchers = await campaignVouchers(alice);
    const future = vouchers.find(fromCampaign(null, `future bonus ${RUN}`));
    if (!bonus) {
      throw new Error(
        `no bonus voucher; wallet has ${vouchers.map((v) => v.name ?? v.code).join(', ') || 'none'}`,
      );
    }
    if (future) throw new Error('future-dated campaign issued a voucher early');
    return `voucher ${bonus.code ?? bonus.id}; future campaign correctly skipped`;
  });

  await step('In-store purchase (SalesPlay receipt) earns points', async () => {
    const before = await points(alice);
    await call('POST', `/webhooks/salesplay?token=${encodeURIComponent(SP_TOKEN)}`, {
      body: {
        type: 'receipts.create',
        receipts: [
          {
            receipt_id: `JRN-${RUN}-POS1`,
            receipt_type: 'SALE',
            total_money: 45.9,
            created_at: new Date().toISOString(),
            customer_mobile: `+6${alice.phone}`,
          },
        ],
      },
    });
    const after = await points(alice);
    if (after - before !== 45) throw new Error(`expected +45, got +${after - before}`);
    return `RM45.90 receipt → +45 pts (balance ${after})`;
  });

  // --- Birthday ----------------------------------------------------------------
  await step('Birthday points credited in birthday month (once per year)', async () => {
    const me = await call('GET', '/customers/me', { token: alice.token });
    const history = await call('GET', '/customers/me/loyalty-history?limit=50', { token: alice.token }).catch(() => null);
    const entries = history?.entries ?? history?.items ?? history ?? [];
    const birthday = Array.isArray(entries) ? entries.filter((e) => e.reason === 'birthday_reward') : [];
    if (birthday.length !== 1) throw new Error(`expected 1 birthday_reward entry, found ${birthday.length}`);
    return `+${birthday[0].deltaPoints} pts (balance ${me.loyalty?.pointsBalance})`;
  });
  await step('Birthday voucher issued by the daily campaign sweep', async () => {
    await runCampaignSweep();
    const v = await waitForVoucher(alice, fromCampaign(birthdayCampaign, `birthday ${RUN}`));
    if (!v) throw new Error('no birthday voucher after sweep');
    return `voucher ${v.code ?? v.id}`;
  });

  // --- Spend points ------------------------------------------------------------
  let rewardVoucherId;
  await step('Spend 100 points on RM10 reward voucher', async () => {
    const before = await points(alice);
    const res = await call('POST', `/rewards-wallet/me/redeem-reward/${reward.id}`, {
      token: alice.token,
      body: { idempotencyKey: `journey-${RUN}-redeem` },
    });
    const after = await points(alice);
    rewardVoucherId = res.userReward?.voucherId;
    if (before - after !== 100) throw new Error(`expected -100, got -${before - after}`);
    if (!rewardVoucherId) throw new Error('no voucher issued for the reward');
    return `balance ${before} → ${after}`;
  });
  await step('Reward redemption blocked when points are insufficient', async () => {
    const bal = await points(alice);
    const expensive = await call('POST', '/admin/rewards-workflow/reward-catalog', {
      admin: true,
      body: { code: `JRN-BIG-${RUN}`, name: 'Too expensive', rewardType: 'FREE_ITEM', pointsCost: bal + 1000, isActive: true },
    });
    try {
      await call('POST', `/rewards-wallet/me/redeem-reward/${expensive.id}`, {
        token: alice.token,
        body: { idempotencyKey: `journey-${RUN}-big` },
      });
    } catch (err) {
      if (String(err.message).includes('Not enough points')) return 'rejected with "Not enough points"';
      throw err;
    }
    throw new Error('redemption succeeded without enough points');
  });

  // --- Redeem at checkout ------------------------------------------------------
  await step('Checkout with RM10 reward voucher: discount applied, voucher used', async () => {
    const order = await buy(alice, { voucherId: rewardVoucherId });
    if (order.discountCents !== 1000) throw new Error(`discount ${order.discountCents}, expected 1000`);
    const v = (await campaignVouchers(alice)).find((x) => x.id === rewardVoucherId);
    if (v && !['USED', 'REDEEMED'].includes(String(v.status).toUpperCase())) {
      throw new Error(`voucher status ${v.status}`);
    }
    return `RM${(order.subtotal / 100).toFixed(2)} − RM10.00, voucher ${v?.status ?? 'removed from wallet'}`;
  });
  await step('Same voucher cannot be used twice', async () => {
    try {
      await buy(alice, { voucherId: rewardVoucherId });
    } catch (err) {
      return `rejected: ${String(err.message).split(': ').pop()}`;
    }
    throw new Error('second use of the voucher was accepted');
  });
  await step('Checkout with birthday voucher (RM20 off)', async () => {
    const v = await waitForVoucher(alice, fromCampaign(birthdayCampaign, `birthday ${RUN}`));
    if (!v) throw new Error('birthday voucher not found');
    const order = await buy(alice, { voucherId: v.id });
    if (order.discountCents !== 2000) throw new Error(`discount ${order.discountCents}, expected 2000`);
    return 'RM20.00 off applied';
  });
  await step('Checkout with bonus-campaign voucher (RM15 off)', async () => {
    const v = await waitForVoucher(alice, fromCampaign(bonusCampaign, `spend bonus ${RUN}`));
    if (!v) throw new Error('bonus voucher not found');
    const order = await buy(alice, { voucherId: v.id });
    if (order.discountCents !== 1500) throw new Error(`discount ${order.discountCents}, expected 1500`);
    return 'RM15.00 off applied';
  });
  await step('Checkout redeeming points-catalog item (50 pts → RM5 off)', async () => {
    const before = await points(alice);
    const order = await buy(alice, { rewardDefinitionId: pointsDefinition.id });
    const after = await points(alice);
    if (order.discountCents !== 500) throw new Error(`discount ${order.discountCents}, expected 500`);
    const earned = Math.floor((order.subtotal - 500) / 100);
    const multiplier = before >= 2000 ? 2 : before >= 1000 ? 1.5 : 1;
    const expected = before - 50 + Math.floor(earned * multiplier);
    if (after !== expected) throw new Error(`balance ${after}, expected ${expected} (−50 + earn)`);
    return `RM5.00 off, 50 pts deducted, balance ${before} → ${after}`;
  });

  // --- Referral ----------------------------------------------------------------
  let bob;
  await step('Friend signs up with the member\'s referral code', async () => {
    bob = await signUp('Bob', { referralCode: alice.referralCode });
    const me = await call('GET', '/customers/me', { token: alice.token });
    if ((me.referralCount ?? 0) < 1) throw new Error(`referralCount ${me.referralCount}`);
    return `referral count ${me.referralCount}`;
  });
  await step('Referrer gets 500 pts + referral voucher after friend\'s first paid order', async () => {
    if (!bob) throw new Error('friend signup failed');
    const before = await points(alice);
    await buy(bob);
    const after = await points(alice);
    if (after - before !== 500) throw new Error(`expected +500, got +${after - before}`);
    const v = await waitForVoucher(alice, fromCampaign(referralCampaign, `referral ${RUN}`));
    if (!v) throw new Error('+500 pts credited but no referral voucher');
    return `+500 pts and RM8 voucher`;
  });
  await step('Referral reward is paid only once (friend\'s second order)', async () => {
    const before = await points(alice);
    await buy(bob);
    const after = await points(alice);
    if (after !== before) throw new Error(`referrer balance changed by ${after - before}`);
    return 'no second referral credit';
  });

  await step('Checkout with referral voucher (RM8 off)', async () => {
    const v = await waitForVoucher(alice, fromCampaign(referralCampaign, `referral ${RUN}`));
    if (!v) throw new Error('referral voucher not found');
    const order = await buy(alice, { voucherId: v.id });
    if (order.discountCents !== 800) throw new Error(`discount ${order.discountCents}, expected 800`);
    return 'RM8.00 off applied';
  });

  // --- Gifting -----------------------------------------------------------------
  await step('Member buys a voucher and sends it to a friend', async () => {
    throw new Error('not implemented — no member-to-member voucher gifting API (see docs/backlog.md)');
  });
}

main()
  .catch((err) => record('journey aborted', false, err.message))
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} steps passed.`);
    process.exit(failed.length ? 1 : 0);
  });
