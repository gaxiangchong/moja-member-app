const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3153';

const TOKEN_KEY = 'moja_access_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Dispatched when the API rejects a request with 401 (invalid/expired session). */
export const SESSION_EXPIRED_EVENT = 'moja:session-expired';

/**
 * Thrown when the session token is missing, invalid, or expired. The app shell
 * listens for SESSION_EXPIRED_EVENT and returns the user to the login screen, so
 * this message is only a fallback if it is ever surfaced inline.
 */
export class SessionExpiredError extends Error {
  constructor(message = 'Your session has expired. Please log in again.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

/** Clear the stale token and ask the app shell to prompt for re-login. */
function handleSessionExpired(): void {
  clearToken();
  try {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  } catch {
    /* no window (non-browser env) */
  }
}

/**
 * fetch() for authenticated endpoints: attaches the bearer token and converts a
 * 401 into a session-expiry (clears token, prompts re-login) so callers never
 * surface a raw "Unauthorized" to the member. Non-401 responses are returned
 * unchanged for each caller to parse as before.
 */
async function authorizedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = getToken();
  if (!token) throw new SessionExpiredError();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) {
    handleSessionExpired();
    throw new SessionExpiredError();
  }
  return res;
}

export type HomeAdSlide = {
  id: string;
  title: string;
  body: string;
  backgroundCss: string;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
};

export function resolveApiAssetUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || /^data:/i.test(url)) return url;
  const prefix = String(base).replace(/\/$/, '');
  return prefix + (url.startsWith('/') ? url : `/${url}`);
}

export async function fetchHomeAdSlides(): Promise<HomeAdSlide[]> {
  try {
    const res = await fetch(`${base}/home-ads/slides`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data as HomeAdSlide[];
  } catch {
    return [];
  }
}

export type PopularProduct = {
  id: string;
  name: string;
  category: string;
  shortDescription?: string;
  description?: string;
  imageUrl?: string;
  basePriceCents: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
  imageScale?: number;
};

export async function fetchPopularProducts(): Promise<PopularProduct[]> {
  try {
    const res = await fetch(`${base}/shop/catalog/popular`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return (data as PopularProduct[]).map((p) => ({
      ...p,
      imageUrl: resolveApiAssetUrl(p.imageUrl),
    }));
  } catch {
    return [];
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || res.statusText);
  }
}

export async function lookupLogin(phone: string): Promise<{
  registered: boolean;
  hasPin: boolean;
  hasEmail: boolean;
  maskedEmail: string | null;
}> {
  const res = await fetch(`${base}/auth/login/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const data = await parseJson<{
    registered?: boolean;
    hasPin?: boolean;
    hasEmail?: boolean;
    maskedEmail?: string | null;
    message?: string | string[];
  }>(res);
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return {
    registered: Boolean(data.registered),
    hasPin: Boolean(data.hasPin),
    hasEmail: Boolean(data.hasEmail),
    maskedEmail: typeof data.maskedEmail === 'string' ? data.maskedEmail : null,
  };
}

export async function requestOtp(
  phone: string,
  purpose?: 'register' | 'recovery',
  email?: string,
): Promise<{
  sent: boolean;
  channel?: string;
  purpose?: string;
  expiresAt: string;
  _devCode?: string;
}> {
  const res = await fetch(`${base}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone,
      ...(purpose ? { purpose } : {}),
      ...(email?.trim() ? { email: email.trim() } : {}),
    }),
  });
  const data = await parseJson<{
    message?: string | string[];
    code?: string;
    sent?: boolean;
    channel?: string;
    expiresAt?: string;
    _devCode?: string;
  }>(res);
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return data as {
    sent: boolean;
    channel?: string;
    purpose?: string;
    expiresAt: string;
    _devCode?: string;
  };
}

export async function verifyOtp(
  phone: string,
  code: string,
  opts?: { referralCode?: string | null; email?: string | null },
): Promise<{
  setupToken: string;
  setupExpiresInSec: number;
  purpose: 'register' | 'recovery';
}> {
  const body: {
    phone: string;
    code: string;
    referralCode?: string;
    email?: string;
    source?: string;
  } = { phone, code, source: 'cake' };
  const ref = opts?.referralCode?.trim();
  if (ref) body.referralCode = ref;
  const email = opts?.email?.trim();
  if (email) body.email = email;
  const res = await fetch(`${base}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    message?: string | string[];
    setupToken?: string;
    setupExpiresInSec?: number;
    purpose?: string;
  }>(res);
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `Verify failed (${res.status})`);
  }
  if (!data.setupToken) throw new Error('No setup token returned');
  const purpose =
    data.purpose === 'recovery' ? 'recovery' : ('register' as const);
  return {
    setupToken: data.setupToken,
    setupExpiresInSec: data.setupExpiresInSec ?? 900,
    purpose,
  };
}

export async function setInitialPin(
  setupToken: string,
  pin: string,
  pinConfirm: string,
): Promise<{ accessToken: string; customerId: string; status: string }> {
  const res = await fetch(`${base}/auth/pin/set-initial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupToken, pin, pinConfirm }),
  });
  const data = await parseJson<{
    message?: string | string[];
    accessToken?: string;
    customerId?: string;
    status?: string;
  }>(res);
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `PIN setup failed (${res.status})`);
  }
  if (!data.accessToken) throw new Error('No access token returned');
  return {
    accessToken: data.accessToken,
    customerId: data.customerId!,
    status: data.status ?? '',
  };
}

export async function loginWithPin(
  phone: string,
  pin: string,
): Promise<{ accessToken: string; customerId: string; status: string }> {
  const res = await fetch(`${base}/auth/pin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin }),
  });
  const data = await parseJson<{
    message?: string | string[];
    accessToken?: string;
    customerId?: string;
    status?: string;
  }>(res);
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `Login failed (${res.status})`);
  }
  if (!data.accessToken) throw new Error('No access token returned');
  return {
    accessToken: data.accessToken,
    customerId: data.customerId!,
    status: data.status ?? '',
  };
}

export async function fetchXenditShopChannels(): Promise<{
  channels: Array<{ code: string; label: string }>;
}> {
  const res = await fetch(`${base}/payments/xendit/shop-channels`);
  const data = await parseJson<{
    channels?: Array<{ code: string; label: string }>;
    message?: string | string[];
  }>(res);
  if (!res.ok) {
    const raw = data.message;
    const msg =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `Channels failed (${res.status})`);
  }
  return { channels: Array.isArray(data.channels) ? data.channels : [] };
}

export async function createXenditCardTokenSession(): Promise<{
  paymentSessionId: string;
  componentsSdkKey: string;
  expiresAt: string | null;
}> {
  const res = await authorizedFetch('/payments/xendit/card-token-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await parseJson<{
    message?: string | string[];
    paymentSessionId?: string;
    componentsSdkKey?: string;
    expiresAt?: string | null;
  }>(res);
  if (!res.ok) {
    const raw = data.message;
    const msg =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `Card token session failed (${res.status})`);
  }
  if (!data.paymentSessionId || !data.componentsSdkKey) {
    throw new Error('Invalid card token session response from server');
  }
  return {
    paymentSessionId: data.paymentSessionId,
    componentsSdkKey: data.componentsSdkKey,
    expiresAt:
      typeof data.expiresAt === 'string' || data.expiresAt === null ? data.expiresAt : null,
  };
}

export type PaymentIntentStatus = {
  referenceId: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | string;
  purpose: 'shop_order' | 'wallet_topup' | string;
  channelCode: string;
  currency: string;
  amountCents: number;
  /** Wallet top-ups: the bonus credit that came with the payment. */
  bonusCents: number;
  orderId: string | null;
  orderNumber: number | null;
  updatedAt: string;
};

/**
 * Polled by the member web app to detect payment completion when an e-wallet
 * (e.g. Touch 'n Go) doesn't return the user to the app after success.
 */
export async function fetchPaymentIntentStatus(
  referenceId: string,
): Promise<PaymentIntentStatus> {
  const res = await authorizedFetch(
    `/payments/intent/${encodeURIComponent(referenceId)}`,
  );
  const data = await parseJson<{
    message?: string | string[];
    referenceId?: string;
    status?: string;
    purpose?: string;
    channelCode?: string;
    currency?: string;
    amountCents?: number;
    bonusCents?: number;
    orderId?: string | null;
    orderNumber?: number | null;
    updatedAt?: string;
  }>(res);
  if (!res.ok) {
    const raw = data.message;
    const msg =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `Payment intent status failed (${res.status})`);
  }
  return {
    referenceId: data.referenceId ?? referenceId,
    status: (data.status ?? 'UNKNOWN') as PaymentIntentStatus['status'],
    purpose: (data.purpose ?? 'unknown') as PaymentIntentStatus['purpose'],
    channelCode: data.channelCode ?? '',
    currency: data.currency ?? '',
    amountCents: typeof data.amountCents === 'number' ? data.amountCents : 0,
    bonusCents: typeof data.bonusCents === 'number' ? data.bonusCents : 0,
    orderId: typeof data.orderId === 'string' ? data.orderId : null,
    orderNumber: typeof data.orderNumber === 'number' ? data.orderNumber : null,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export async function getXenditCardTokenSessionStatus(paymentSessionId: string): Promise<{
  paymentSessionId: string;
  status: string;
  paymentTokenId: string | null;
}> {
  const res = await authorizedFetch(
    `/payments/xendit/card-token-session/${encodeURIComponent(paymentSessionId)}`,
  );
  const data = await parseJson<{
    message?: string | string[];
    paymentSessionId?: string;
    status?: string;
    paymentTokenId?: string | null;
  }>(res);
  if (!res.ok) {
    const raw = data.message;
    const msg =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `Card token session status failed (${res.status})`);
  }
  return {
    paymentSessionId: data.paymentSessionId ?? paymentSessionId,
    status: data.status ?? 'UNKNOWN',
    paymentTokenId: typeof data.paymentTokenId === 'string' ? data.paymentTokenId : null,
  };
}

export type ShopOrderCheckoutResult =
  | {
      demoMode: true;
      orderId: string;
      orderNumber: number;
      totalCents: number;
      placedAt: string;
      status: string;
    }
  | {
      zeroPaid: true;
      order: {
        id: string;
        orderNumber: number;
        placedAt: string;
        status: string;
        totalCents: number;
      };
    }
  | {
      /** The whole order was paid from wallet credits. */
      paidWithCredits: true;
      order: {
        id: string;
        orderNumber: number;
        placedAt: string;
        status: string;
        totalCents: number;
      };
      creditsSpentCents: number;
      balanceCents: number;
    }
  | {
      demoMode: false;
      zeroPaid: false;
      orderId: string;
      orderNumber: number;
      referenceId: string;
      paymentRequestId: string | null;
      status: string;
      redirectUrl: string | null;
      channelCode: string;
      country: string;
      currency: string;
      amountCents: number;
    };

export async function createShopOrderCheckout(payload: {
  channelCode?: string;
  paymentTokenId?: string;
  voucherId?: string;
  rewardDefinitionId?: string;
  idempotencyKey?: string;
  /** Pay the whole order from wallet credits (no channel or card needed). */
  payWithCredits?: boolean;
  order: {
    totalCents: number;
    discountCents?: number;
    lines: SubmitMemberOrderLine[];
    fulfillmentSummary?: string[] | null;
    fulfilmentType?: 'IN_STORE' | 'PICKUP' | 'DELIVERY';
    scheduledDate?: string | null;
    scheduledSlot?: string | null;
    /** Required when `fulfilmentType` is DELIVERY. */
    delivery?: {
      address: string;
      contactName: string;
      contactPhone: string;
      arrangement: 'SELF' | 'MOJA';
    };
  };
}): Promise<ShopOrderCheckoutResult> {
  const res = await authorizedFetch('/payments/xendit/shop-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseJson<ShopOrderCheckoutResult & { message?: string | string[] }>(res);
  if (!res.ok) {
    const raw = data.message;
    const msg =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `Checkout failed (${res.status})`);
  }
  return data as ShopOrderCheckoutResult;
}

export async function completeDemoShopOrder(orderId: string): Promise<{
  order: {
    id: string;
    orderNumber: number;
    placedAt: string;
    status: string;
    totalCents: number;
    lines: Array<{
      id: string;
      productId: string;
      name: string;
      variantLabel: string | null;
      unitPriceCents: number;
      qty: number;
      imageUrl: string | null;
    }>;
  };
}> {
  const res = await authorizedFetch('/payments/demo/complete-shop-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
  const data = await parseJson<{
    order?: {
      id: string;
      orderNumber: number;
      placedAt: string;
      status: string;
      totalCents: number;
      lines: Array<{
        id: string;
        productId: string;
        name: string;
        variantLabel: string | null;
        unitPriceCents: number;
        qty: number;
        imageUrl: string | null;
      }>;
    };
    message?: string | string[];
  }>(res);
  if (!res.ok || !data.order) {
    const raw = data.message;
    const msg =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `Demo payment failed (${res.status})`);
  }
  return { order: data.order };
}

export async function createWalletTopUpSession(
  amountCents: number,
  channelCode?: string,
): Promise<{
  /** True when payments are in demo mode: no redirect, finish with completeDemoWalletTopUp. */
  demoMode: boolean;
  referenceId: string;
  paymentRequestId: string | null;
  status: string;
  redirectUrl: string | null;
  channelCode: string;
  country: string;
  currency: string;
  amountCents: number;
  /** Bonus credit this top-up earns, fixed when the payment starts. */
  bonusCents: number;
}> {
  const res = await authorizedFetch('/payments/xendit/wallet-topup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amountCents,
      ...(channelCode ? { channelCode } : {}),
    }),
  });
  const data = await parseJson<{
    message?: string | string[];
    referenceId?: string;
    paymentRequestId?: string | null;
    status?: string;
    redirectUrl?: string | null;
    channelCode?: string;
    country?: string;
    currency?: string;
    amountCents?: number;
    bonusCents?: number;
    demoMode?: boolean;
  }>(res);
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `Payment session failed (${res.status})`);
  }
  return {
    demoMode: data.demoMode === true,
    bonusCents: typeof data.bonusCents === 'number' ? data.bonusCents : 0,
    referenceId: data.referenceId!,
    paymentRequestId: data.paymentRequestId ?? null,
    status: data.status ?? '',
    redirectUrl: data.redirectUrl ?? null,
    channelCode: data.channelCode ?? '',
    country: data.country ?? '',
    currency: data.currency ?? '',
    amountCents: data.amountCents ?? amountCents,
  };
}

export type MemberProfile = {
  id: string;
  phoneE164: string;
  status: string;
  displayName: string | null;
  email: string | null;
  birthday: string | null;
  memberTier: string | null;
  loyalty: { pointsBalance: number; walletId: string | null };
  createdAt: string;
  updatedAt: string;
  referralCode?: string | null;
  referralCount?: number;
  lastLoginAt?: string | null;
  favoriteProducts?: Array<{ productId: string; name: string; totalQty: number }>;
  storedWallet?: {
    walletId: string;
    currentWalletBalance: number;
    lifetimeSpentAmount: number;
    lifetimeTopUpAmount: number;
  } | null;
};

export async function fetchMe(): Promise<MemberProfile> {
  const res = await authorizedFetch('/customers/me');
  const data = await parseJson<MemberProfile & { message?: string }>(res);
  if (!res.ok) {
    throw new Error(
      typeof data.message === 'string' ? data.message : 'Failed to load profile',
    );
  }
  return data as MemberProfile;
}

export async function updateMe(input: {
  displayName?: string;
  email?: string;
  birthday?: string;
}): Promise<MemberProfile> {
  const res = await authorizedFetch('/customers/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await parseJson<MemberProfile & { message?: string }>(res);
  if (!res.ok) {
    throw new Error(
      typeof data.message === 'string' ? data.message : 'Failed to update profile',
    );
  }
  return data as MemberProfile;
}

/** A reward the member redeemed with points. */
export type RewardRedemption = {
  id: string;
  title: string;
  pointsSpent: number;
  redeemedAt: string;
  /** The shop order it was used on; null for rewards redeemed straight from the catalog. */
  orderNumber: number | null;
  /** `returned`: the order was cancelled or never paid, so the points came back. */
  status: 'redeemed' | 'pending' | 'returned';
  /** The code generated when the reward was redeemed, to paste at checkout. */
  code?: string | null;
  /** Whether that code can still be used. */
  voucherStatus?: 'active' | 'used' | 'expired' | null;
};

/** What the member gets when they redeem a reward with points. */
export type RewardCodeResult = {
  code: string;
  title: string;
  expiresAt: string | null;
  pointsSpent: number;
  pointsBalance: number;
  /** True when this was a repeat tap and the earlier code was returned (nothing more charged). */
  repeat: boolean;
};

/** Spends the reward's points and returns a freshly generated one-time code for checkout. */
export async function redeemRewardForCode(rewardId: string): Promise<RewardCodeResult> {
  const res = await authorizedFetch(`/rewards-wallet/me/redeem-reward/${encodeURIComponent(rewardId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
  });
  const data = await parseJson<{
    idempotent?: boolean;
    voucher?: { code: string; name: string; expiresAt: string | null } | null;
    pointsSpent?: number;
    pointsBalance?: number;
    message?: string | string[];
  }>(res);
  if (!res.ok) {
    const raw = data.message;
    throw new Error(
      typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join(', ') : 'Could not redeem this reward',
    );
  }
  if (!data.voucher?.code) throw new Error('No code was generated. Please try again.');
  return {
    code: data.voucher.code,
    title: data.voucher.name,
    expiresAt: data.voucher.expiresAt,
    pointsSpent: data.pointsSpent ?? 0,
    pointsBalance: data.pointsBalance ?? 0,
    repeat: data.idempotent === true,
  };
}

export type MemberRewardsPayload = {
  wallet: {
    /** Points the member can spend. */
    pointsBalance: number;
    /** Everything ever earned. The membership tier is judged on this, so spending points never lowers it. */
    lifetimePoints?: number;
  };
  /** Newest first. */
  redemptions?: RewardRedemption[];
  vouchers: Array<{
    id: string;
    status: string;
    issuedAt: string;
    expiresAt: string | null;
    definition: {
      id: string;
      code: string;
      title: string;
      description: string | null;
      pointsCost: number | null;
      rebateValueSen?: number | null;
      minSpendSen?: number | null;
      percentageOff?: number | null;
      /** PERCENTAGE, FIXED_AMOUNT, DELIVERY_DISCOUNT, WALLET_TOPUP_CODE, FREE_ITEM (null for older vouchers). */
      voucherType?: string | null;
    };
  }>;
  rewards: Array<{
    /** `code`: redeem for a generated code to paste at checkout. `checkout`: applied at checkout. */
    redeemVia?: 'code' | 'checkout';
    id: string;
    code: string;
    title: string;
    description: string | null;
    pointsCost: number | null;
    isActive: boolean;
    imageUrl?: string | null;
    rewardCategory?: string | null;
    rebateValueSen?: number | null;
    minSpendSen?: number | null;
    percentageOff?: number | null;
  }>;
};

export type ShopCatalogProduct = {
  id: string;
  category: 'whole_cakes' | 'cake_slices' | 'drinks' | 'specials';
  categoryLabel?: string;
  name: string;
  shortDescription: string;
  description: string;
  imageUrl: string;
  imageOffsetX?: number;
  imageOffsetY?: number;
  imageScale?: number;
  basePriceCents: number;
  priceDisplay?: string;
  variants?: Array<{
    id: string;
    label: string;
    priceCents: number;
    available?: boolean;
    priceDisplay?: string | null;
  }>;
  soldOut?: boolean;
  /** Kitchen-tracked count of this cake currently ready. `undefined` = not stock-tracked. */
  availableQty?: number;
};

/** Effective sold-out state: the manual toggle OR a kitchen-tracked count at zero. */
export function isShopProductSoldOut(p: ShopCatalogProduct): boolean {
  return p.soldOut === true || (p.availableQty != null && p.availableQty <= 0);
}

export function resolveShopAssetUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || /^data:/i.test(url)) return url;
  const shopBase =
    import.meta.env.VITE_SHOP_WEB_URL?.trim().replace(/\/$/, '') ||
    'http://localhost:3000';
  return `${shopBase}${url.startsWith('/') ? '' : '/'}${url}`;
}

export async function requestShopHandoff(): Promise<{
  handoffToken: string;
  expiresInSec: number;
  consumeUrl: string;
}> {
  const res = await authorizedFetch('/auth/shop-handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await parseJson<{
    message?: string | string[];
    code?: string;
    handoffToken?: string;
    expiresInSec?: number;
    consumeUrl?: string;
  }>(res);
  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `Handoff failed (${res.status})`);
  }
  if (!data.consumeUrl || !data.handoffToken) {
    throw new Error('Invalid handoff response from server');
  }
  return {
    handoffToken: data.handoffToken,
    expiresInSec: data.expiresInSec ?? 45,
    consumeUrl: data.consumeUrl,
  };
}

export type LoyaltyHistoryEntry = {
  id: string;
  deltaPoints: number;
  balanceAfter: number;
  reason: string;
  referenceType: string | null;
  referenceId: string | null;
  orderNumber: number | null;
  createdAt: string;
};

export type LoyaltyHistoryPayload = {
  pointsBalance: number;
  entries: LoyaltyHistoryEntry[];
};

/**
 * Member-facing loyalty points history. Includes both in-store (SalesPlay)
 * and online (shop) entries because they share the same wallet.
 */
export async function fetchMyLoyaltyHistory(
  limit = 25,
): Promise<LoyaltyHistoryPayload> {
  const res = await authorizedFetch(
    `/customers/me/loyalty-history?limit=${encodeURIComponent(String(limit))}`,
  );
  const data = await parseJson<{
    message?: string | string[];
    pointsBalance?: number;
    entries?: LoyaltyHistoryEntry[];
  }>(res);
  if (!res.ok) {
    const raw = data.message;
    const msg =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `Loyalty history failed (${res.status})`);
  }
  return {
    pointsBalance:
      typeof data.pointsBalance === 'number' ? data.pointsBalance : 0,
    entries: Array.isArray(data.entries) ? data.entries : [],
  };
}

export async function fetchMeRewards(): Promise<MemberRewardsPayload> {
  const res = await authorizedFetch('/customers/me/rewards');
  const data = await parseJson<MemberRewardsPayload & { message?: string }>(res);
  if (!res.ok) {
    throw new Error(
      typeof data.message === 'string' ? data.message : 'Failed to load rewards',
    );
  }
  return data as MemberRewardsPayload;
}

export type SubmitMemberOrderLine = {
  productId: string;
  name: string;
  unitPriceCents: number;
  qty: number;
  variantLabel?: string | null;
  imageUrl?: string | null;
};

export type SubmitMemberOrderResult = {
  id: string;
  orderNumber: number;
  placedAt: string;
  totalCents: number;
  status: string;
  lines: Array<{
    id: string;
    productId: string;
    name: string;
    variantLabel: string | null;
    unitPriceCents: number;
    qty: number;
    imageUrl: string | null;
  }>;
};

export type MemberOrderRow = {
  id: string;
  orderNumber: number;
  placedAt: string;
  completedAt: string | null;
  preparingAt?: string | null;
  readyAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  fulfilmentType?: 'IN_STORE' | 'PICKUP' | 'DELIVERY';
  scheduledDate?: string | null;
  scheduledSlot?: string | null;
  deliveryFeeCents?: number;
  /** Delivery orders: where it goes and who books the courier. */
  delivery?: {
    address: string;
    contactName: string | null;
    contactPhone: string | null;
    arrangement: 'SELF' | 'MOJA' | null;
  } | null;
  cancellable?: boolean;
  totalCents: number;
  status: string;
  fulfillmentSummary: string[];
  lines: Array<{
    id: string;
    productId: string;
    name: string;
    variantLabel: string | null;
    unitPriceCents: number;
    qty: number;
    imageUrl: string | null;
  }>;
};

/** `historyDays` is how many days of finished orders the shop keeps on this list (set by the admin). */
export async function fetchMemberOrders(
  limit = 40,
): Promise<{ orders: MemberOrderRow[]; historyDays: number | null }> {
  const res = await authorizedFetch(`/customers/me/orders?limit=${encodeURIComponent(String(limit))}`);
  const data = await parseJson<{
    orders?: MemberOrderRow[];
    historyDays?: number;
    message?: string | string[];
  }>(res);
  if (!res.ok) {
    const raw = data.message;
    const msg =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `Orders failed (${res.status})`);
  }
  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    historyDays: typeof data.historyDays === 'number' ? data.historyDays : null,
  };
}

/** What the member has saved by being a member, in sen. */
export type MemberSavings = {
  totalSavedCents: number;
  /** Vouchers and points rewards used on app orders. */
  onlineSavedCents: number;
  /** Discounts on in-store receipts matched to the member. */
  inStoreSavedCents: number;
  ordersCounted: number;
  memberSince: string | null;
  /** How many days of finished orders the Orders page lists. */
  historyDays: number;
};

export async function fetchMemberSavings(): Promise<MemberSavings> {
  const res = await authorizedFetch('/customers/me/savings');
  const data = await parseJson<Partial<MemberSavings> & { message?: string | string[] }>(res);
  if (!res.ok) {
    const raw = data.message;
    throw new Error((Array.isArray(raw) ? raw.join(', ') : raw) || `Savings failed (${res.status})`);
  }
  return {
    totalSavedCents: data.totalSavedCents ?? 0,
    onlineSavedCents: data.onlineSavedCents ?? 0,
    inStoreSavedCents: data.inStoreSavedCents ?? 0,
    ordersCounted: data.ordersCounted ?? 0,
    memberSince: data.memberSince ?? null,
    historyDays: data.historyDays ?? 7,
  };
}

export async function fetchShopCatalogProducts(): Promise<ShopCatalogProduct[]> {
  const res = await fetch(`${base}/shop/catalog/products`);
  const data = await parseJson<Array<ShopCatalogProduct> & { message?: string }>(res);
  if (!res.ok) {
    throw new Error(
      typeof data.message === 'string' ? data.message : 'Failed to load shop catalog',
    );
  }
  const items = (Array.isArray(data) ? data : []) as ShopCatalogProduct[];
  return items.map((p) => ({
    ...p,
    imageUrl: resolveApiAssetUrl(p.imageUrl),
    variants: p.variants
      ?.filter((v) => v.available !== false && v.priceCents > 0)
      .map((v) => ({ ...v })),
  }));
}

export type CartHandoffLine = {
  productId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  variantLabel: string | null;
  imageUrl: string | null;
};

export type CartHandoffFulfillment = {
  method: 'pickup' | null;
  preferredTime: string | null;
  preferredTimeLabel: string | null;
};

export async function consumeShopCartHandoff(token: string): Promise<{
  lines: CartHandoffLine[];
  subtotalCents: number;
  fulfillment: CartHandoffFulfillment | null;
}> {
  const res = await fetch(
    `${base}/shop/cart-handoff/consume?token=${encodeURIComponent(token)}`,
  );
  const data = await parseJson<{
    lines?: CartHandoffLine[];
    subtotalCents?: number;
    fulfillment?: CartHandoffFulfillment | null;
    message?: string | string[];
    code?: string;
  }>(res);
  if (!res.ok) {
    const raw = data.message;
    const msg =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.join(', ')
          : 'Cart import failed';
    throw new Error(msg);
  }
  return {
    lines: Array.isArray(data.lines) ? data.lines : [],
    subtotalCents: Number(data.subtotalCents) || 0,
    fulfillment: data.fulfillment ?? null,
  };
}

/** Member cancels their own order (only allowed before the kitchen starts). */
export async function cancelMyOrder(
  orderId: string,
): Promise<{
  id: string;
  status: string;
  creditsReturnedCents?: number;
  pointsReturned?: number;
}> {
  const res = await authorizedFetch(
    `/customers/me/orders/${encodeURIComponent(orderId)}/cancel`,
    { method: 'POST' },
  );
  const data = await parseJson<{
    id?: string;
    status?: string;
    creditsReturnedCents?: number;
    pointsReturned?: number;
    message?: string | string[];
  }>(res);
  if (!res.ok) {
    const raw = data.message;
    const msg = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join(', ') : 'Could not cancel this order';
    throw new Error(msg);
  }
  return {
    id: data.id ?? orderId,
    status: data.status ?? 'cancelled',
    creditsReturnedCents: Number(data.creditsReturnedCents) || 0,
    pointsReturned: Number(data.pointsReturned) || 0,
  };
}

export type ShopAvailability = {
  businessDate: string;
  products: { id: string; sellableQty: number | null }[];
};

/** Sellable quantity per product for one collection day. */
export type PickupSlotOffer = {
  start: string;
  label: string;
  available: boolean;
  reason: string | null;
  remaining: number | null;
};

export type PickupSlotDay = {
  date: string;
  today: string;
  maxDate: string;
  openTime: string;
  closeTime: string;
  closed: boolean;
  closedReason: string | null;
  storeOpen: boolean;
  storeClosedReason: string | null;
  leadTimeMessage: string | null;
  slots: PickupSlotOffer[];
};

export type DeliveryInfo = {
  /** Delivery can be chosen at checkout. */
  enabled: boolean;
  /** Moja Maison's WhatsApp number for courier help (digits, with country code); empty = not set. */
  whatsappNumber: string;
};

/** Whether delivery is offered, and the WhatsApp number to ask for courier help. */
export async function fetchDeliveryInfo(): Promise<DeliveryInfo> {
  const res = await fetch(`${base}/shop/delivery-info`);
  const data = await parseJson<Partial<DeliveryInfo> & { message?: string }>(res);
  if (!res.ok) {
    throw new Error(typeof data.message === 'string' ? data.message : 'Failed to load delivery info');
  }
  return { enabled: data.enabled !== false, whatsappNumber: data.whatsappNumber ?? '' };
}

/** Open pickup windows for one day, including why a slot is closed. */
export async function fetchPickupSlots(date?: string): Promise<PickupSlotDay> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await fetch(`${base}/shop/pickup-slots${qs}`);
  const data = await parseJson<PickupSlotDay & { message?: string }>(res);
  if (!res.ok) {
    throw new Error(
      typeof data.message === 'string' ? data.message : 'Failed to load pickup times',
    );
  }
  return data;
}

export async function fetchShopAvailability(date?: string): Promise<ShopAvailability> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await fetch(`${base}/shop/catalog/availability${qs}`);
  const data = await parseJson<ShopAvailability & { message?: string }>(res);
  if (!res.ok) {
    throw new Error(
      typeof data.message === 'string' ? data.message : 'Failed to load availability',
    );
  }
  return data;
}

/** What the top-up screen offers; set by the shop in the admin. */
export type TopUpOptions = {
  /** Members can only top up while this is on. */
  enabled: boolean;
  minTopUpCents: number;
  maxTopUpCents: number;
  /** Top up at least `topUpCents`, get `bonusCents` extra. Ascending. */
  tiers: Array<{ topUpCents: number; bonusCents: number }>;
  /** Payments are in demo mode: no redirect to a payment page. */
  demoMode: boolean;
};

export async function fetchTopUpOptions(): Promise<TopUpOptions> {
  const res = await authorizedFetch('/payments/xendit/wallet-topup/options');
  const data = await parseJson<Partial<TopUpOptions> & { message?: string | string[] }>(res);
  if (!res.ok) {
    const raw = data.message;
    throw new Error(
      (Array.isArray(raw) ? raw.join(', ') : raw) || `Top-up options failed (${res.status})`,
    );
  }
  return {
    enabled: data.enabled === true,
    minTopUpCents: data.minTopUpCents ?? 1000,
    maxTopUpCents: data.maxTopUpCents ?? 100000,
    tiers: Array.isArray(data.tiers) ? data.tiers : [],
    demoMode: data.demoMode === true,
  };
}

/** Demo mode only: finishes a top-up as if the payment had succeeded. */
export async function completeDemoWalletTopUp(
  referenceId: string,
): Promise<{ referenceId: string; status: string; amountCents: number; bonusCents: number }> {
  const res = await authorizedFetch('/payments/demo/complete-wallet-topup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ referenceId }),
  });
  const data = await parseJson<{
    message?: string | string[];
    referenceId?: string;
    status?: string;
    amountCents?: number;
    bonusCents?: number;
  }>(res);
  if (!res.ok) {
    const raw = data.message;
    throw new Error(
      (Array.isArray(raw) ? raw.join(', ') : raw) || `Top-up failed (${res.status})`,
    );
  }
  return {
    referenceId: data.referenceId ?? referenceId,
    status: data.status ?? '',
    amountCents: data.amountCents ?? 0,
    bonusCents: data.bonusCents ?? 0,
  };
}
