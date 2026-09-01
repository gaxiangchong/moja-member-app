const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3153';

const TOKEN_KEY = 'moja_admin_access_token';
const API_KEY_KEY = 'moja_admin_api_key';
const AUTH_MODE_KEY = 'moja_admin_auth_mode';
const IDENTITY_KEY = 'moja_admin_identity';

/**
 * Mirrors the backend's two accepted credential modes (AdminAuthGuard):
 * a personal JWT from email/password login, or the shared `x-admin-api-key`
 * service key (legacy/full-access bypass, not tied to one admin's audit
 * trail — prefer email/password for normal use).
 */
export type AdminIdentity =
  | { kind: 'user'; id: string; email: string; role: string; displayName: string | null }
  | { kind: 'api_key'; actorLabel: string };

type AuthMode = 'jwt' | 'api_key';

function getAuthMode(): AuthMode | null {
  const m = localStorage.getItem(AUTH_MODE_KEY);
  return m === 'jwt' || m === 'api_key' ? m : null;
}

export function hasSession(): boolean {
  const mode = getAuthMode();
  if (mode === 'jwt') return Boolean(localStorage.getItem(TOKEN_KEY));
  if (mode === 'api_key') return Boolean(localStorage.getItem(API_KEY_KEY));
  return false;
}

export function getStoredIdentity(): AdminIdentity | null {
  const raw = localStorage.getItem(IDENTITY_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminIdentity;
  } catch {
    return null;
  }
}

function setJwtSession(token: string, identity: AdminIdentity): void {
  localStorage.setItem(AUTH_MODE_KEY, 'jwt');
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  localStorage.removeItem(API_KEY_KEY);
}

function setApiKeySession(key: string, identity: AdminIdentity): void {
  localStorage.setItem(AUTH_MODE_KEY, 'api_key');
  localStorage.setItem(API_KEY_KEY, key);
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  localStorage.removeItem(TOKEN_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(API_KEY_KEY);
  localStorage.removeItem(AUTH_MODE_KEY);
  localStorage.removeItem(IDENTITY_KEY);
}

/** Dispatched when the API rejects a request with 401 (invalid/expired session). */
export const SESSION_EXPIRED_EVENT = 'moja-admin:session-expired';

export class SessionExpiredError extends Error {
  constructor(message = 'Your session has expired. Please log in again.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

function handleSessionExpired(): void {
  clearSession();
  try {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  } catch {
    /* no window (non-browser env) */
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

function extractMessage(
  data: { message?: string | string[] },
  res: Response,
): string {
  const msg =
    typeof data.message === 'string'
      ? data.message
      : Array.isArray(data.message)
        ? data.message.join(', ')
        : '';
  return msg || `Request failed (${res.status})`;
}

function authHeader(): Record<string, string> {
  const mode = getAuthMode();
  if (mode === 'api_key') {
    const key = localStorage.getItem(API_KEY_KEY);
    if (!key) throw new SessionExpiredError();
    return { 'x-admin-api-key': key };
  }
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) throw new SessionExpiredError();
  return { Authorization: `Bearer ${token}` };
}

/**
 * fetch() for authenticated admin endpoints: attaches whichever credential
 * is active (JWT bearer or API key) and converts a 401 into a
 * session-expiry (clears the session, prompts re-login) so callers never
 * have to special-case a raw 401 themselves.
 */
async function authorizedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...authHeader(),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) {
    handleSessionExpired();
    throw new SessionExpiredError();
  }
  return res;
}

export async function login(
  email: string,
  password: string,
): Promise<AdminIdentity> {
  const res = await fetch(`${base}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJson<{
    accessToken?: string;
    user?: { id: string; email: string; role: string; displayName: string | null };
    message?: string | string[];
  }>(res);
  if (!res.ok || !data.accessToken || !data.user) {
    throw new Error(extractMessage(data, res));
  }
  const identity: AdminIdentity = { kind: 'user', ...data.user };
  setJwtSession(data.accessToken, identity);
  return identity;
}

/**
 * Service-key login: the backend has no dedicated endpoint for this mode —
 * the key is just sent as a header on every request — so this stores it
 * optimistically, then confirms it's valid via /admin/auth/me (which
 * returns { kind: 'api_key', actorLabel } for this credential type).
 */
export async function loginWithApiKey(key: string): Promise<AdminIdentity> {
  const res = await fetch(`${base}/admin/auth/me`, {
    headers: { 'x-admin-api-key': key },
  });
  const data = await parseJson<AdminIdentity & { message?: string | string[] }>(res);
  if (!res.ok || data.kind !== 'api_key') {
    throw new Error(extractMessage(data as { message?: string | string[] }, res) || 'Invalid API key');
  }
  setApiKeySession(key, data);
  return data;
}

export function logout(): void {
  clearSession();
}

export async function fetchMe(): Promise<AdminIdentity> {
  const res = await authorizedFetch('/admin/auth/me');
  const data = await parseJson<AdminIdentity & { message?: string | string[] }>(res);
  if (!res.ok) throw new Error(extractMessage(data as { message?: string | string[] }, res));
  return data;
}

export type OverviewStats = {
  members: number;
  activeMembers: number;
  newMembers: { today: number; thisWeek: number; thisMonth: number };
  loyalty: {
    pointsIssued: number;
    pointsRedeemed: number;
    walletTopUpTotal: number;
  };
  vouchers: {
    issued: number;
    redeemed: number;
    expired: number;
    void: number;
    redemptionRate: number;
  };
  otpVerifiedCount: number;
  birthdayMembersThisMonth: number;
  commerce: { ordersLast30Days: number; gmvLast30DaysCents: number };
  recentRegistrations: Array<{
    id: string;
    phoneE164: string;
    displayName: string | null;
    status: string;
    createdAt: string;
  }>;
  recentVoucherActivity: Array<{
    id: string;
    status: string;
    code: string;
    title: string;
    memberPhone: string;
    issuedAt: string | null;
    redeemedAt: string | null;
    updatedAt: string;
  }>;
  recentWalletActivity: Array<{
    id: string;
    memberPhone: string;
    deltaPoints: number;
    balanceAfter: number;
    reason: string;
    referenceType: string;
    createdAt: string;
  }>;
};

export async function fetchOverview(): Promise<OverviewStats> {
  const res = await authorizedFetch('/admin/overview');
  const data = await parseJson<OverviewStats & { message?: string | string[] }>(
    res,
  );
  if (!res.ok) throw new Error(extractMessage(data, res));
  return data;
}

export type TopSpender = {
  id: string;
  phoneE164: string;
  displayName: string | null;
  lifetimeSpentCents: number;
};

export type TopReferrer = {
  id: string;
  phoneE164: string;
  displayName: string | null;
  referralCode: string;
  referralsSignedUp: number;
};

export type TopProduct = {
  productId: string;
  name: string;
  qtySold: number;
  orders: number;
};

export type ReportingDashboard = {
  marketing: {
    signupsByDay: Array<{
      date: string;
      newMembers: number;
      referredSignups: number;
      organicSignups: number;
    }>;
    topSpenders: TopSpender[];
    topSpendersToday: TopSpender[];
    topSpendersThisMonth: TopSpender[];
    topSpendersThisYear: TopSpender[];
    topReferrers: TopReferrer[];
    topProducts: TopProduct[];
  };
};

/**
 * Requires REPORT_VIEW — some admin roles don't have it. Callers should
 * treat a failure here as "chart panels unavailable", not a page-level error
 * (mirrors the legacy dashboard's try/catch around this same call).
 */
export async function fetchReportingDashboard(): Promise<ReportingDashboard> {
  const res = await authorizedFetch('/admin/reports/dashboard');
  const data = await parseJson<ReportingDashboard & { message?: string | string[] }>(
    res,
  );
  if (!res.ok) throw new Error(extractMessage(data, res));
  return data;
}

export type AdminCustomer = {
  id: string;
  phoneE164: string;
  status: string;
  displayName: string | null;
  email: string | null;
  memberTier: string | null;
  pointsBalance: number;
  lifetimeSpentCents: number;
  referralsMade: number;
  activeVoucherCount: number;
  createdAt: string;
  lastLoginAt: string | null;
};

export type CustomersPage = {
  items: AdminCustomer[];
  page: number;
  pageSize: number;
  total: number;
};

export async function fetchCustomers(params: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<CustomersPage> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  if (params.search?.trim()) qs.set('search', params.search.trim());
  const query = qs.toString();
  const res = await authorizedFetch(`/admin/customers${query ? `?${query}` : ''}`);
  const data = await parseJson<CustomersPage & { message?: string | string[] }>(
    res,
  );
  if (!res.ok) throw new Error(extractMessage(data, res));
  return data;
}

export type AdminOrderLine = {
  id: string;
  productId: string;
  name: string;
  variantLabel: string | null;
  unitPriceCents: number;
  qty: number;
};

export type AdminOrder = {
  id: string;
  orderNumber: string;
  placedAt: string;
  completedAt: string | null;
  totalCents: number;
  status: string;
  fulfillmentSummary: string[];
  customerDisplayName: string | null;
  customerPhoneMasked: string;
  lineCount: number;
  lines: AdminOrderLine[];
};

export type CommerceOrdersQuery = {
  status?: 'placed' | 'completed' | 'all';
  dateField?: 'placed' | 'completed';
  from?: string;
  to?: string;
  productContains?: string;
  productId?: string;
  sort?:
    | 'placed_desc'
    | 'placed_asc'
    | 'total_desc'
    | 'total_asc'
    | 'completed_desc'
    | 'completed_asc';
  limit?: number;
};

export async function fetchCommerceOrders(
  params: CommerceOrdersQuery,
): Promise<{ orders: AdminOrder[] }> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.dateField) qs.set('dateField', params.dateField);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.productContains?.trim()) qs.set('productContains', params.productContains.trim());
  if (params.productId?.trim()) qs.set('productId', params.productId.trim());
  if (params.sort) qs.set('sort', params.sort);
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  const res = await authorizedFetch(`/admin/commerce/orders${query ? `?${query}` : ''}`);
  const data = await parseJson<{ orders: AdminOrder[] } & { message?: string | string[] }>(
    res,
  );
  if (!res.ok) throw new Error(extractMessage(data, res));
  return data;
}

/** Resolves a relative API-hosted asset path (e.g. `/uploads/products/x.jpg`) to an absolute URL. */
export function resolveApiAssetUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || /^data:/i.test(url)) return url;
  const prefix = base.replace(/\/$/, '');
  return prefix + (url.startsWith('/') ? url : `/${url}`);
}

export const SHOP_CATALOG_CATEGORIES = [
  'whole_cakes',
  'cake_slices',
  'drinks',
  'specials',
] as const;
export type ShopCatalogCategory = (typeof SHOP_CATALOG_CATEGORIES)[number];

export type ShopCatalogVariant = {
  id?: string;
  label: string;
  priceCents: number;
  available?: boolean;
};

export type ShopCatalogProduct = {
  id: string;
  category: ShopCatalogCategory;
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
  variants?: ShopCatalogVariant[];
  badge?: string;
  soldOut?: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type ShopCatalogProductInput = {
  category: ShopCatalogCategory;
  name: string;
  shortDescription: string;
  description: string;
  imageUrl: string;
  imageOffsetX?: number;
  imageOffsetY?: number;
  imageScale?: number;
  basePriceCents: number;
  sortOrder?: number;
  isActive?: boolean;
  categoryLabel?: string;
  priceDisplay?: string;
  badge?: string;
  soldOut?: boolean;
  variants?: ShopCatalogVariant[];
};

async function parseCatalogResponse<T>(res: Response): Promise<T> {
  const data = await parseJson<T & { message?: string | string[] }>(res);
  if (!res.ok) throw new Error(extractMessage(data as { message?: string | string[] }, res));
  return data;
}

export async function fetchShopCatalogProducts(): Promise<ShopCatalogProduct[]> {
  const res = await authorizedFetch('/admin/shop-catalog/products');
  return parseCatalogResponse<ShopCatalogProduct[]>(res);
}

export async function createShopCatalogProduct(
  input: ShopCatalogProductInput,
): Promise<ShopCatalogProduct> {
  const res = await authorizedFetch('/admin/shop-catalog/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseCatalogResponse<ShopCatalogProduct>(res);
}

export async function updateShopCatalogProduct(
  id: string,
  input: Partial<ShopCatalogProductInput>,
): Promise<ShopCatalogProduct> {
  const res = await authorizedFetch(`/admin/shop-catalog/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseCatalogResponse<ShopCatalogProduct>(res);
}

export async function deleteShopCatalogProduct(id: string): Promise<void> {
  const res = await authorizedFetch(`/admin/shop-catalog/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await parseJson<{ message?: string | string[] }>(res);
    throw new Error(extractMessage(data, res));
  }
}

/** Multipart upload — deliberately no Content-Type header so the browser sets the boundary. */
export async function uploadShopCatalogProductImage(
  id: string,
  file: File,
): Promise<ShopCatalogProduct> {
  const form = new FormData();
  form.append('file', file);
  const res = await authorizedFetch(`/admin/shop-catalog/products/${encodeURIComponent(id)}/image`, {
    method: 'POST',
    body: form,
  });
  return parseCatalogResponse<ShopCatalogProduct>(res);
}

export async function clearShopCatalogProductImage(id: string): Promise<ShopCatalogProduct> {
  const res = await authorizedFetch(`/admin/shop-catalog/products/${encodeURIComponent(id)}/image`, {
    method: 'DELETE',
  });
  return parseCatalogResponse<ShopCatalogProduct>(res);
}

export type HomePopularConfig = {
  productIds: string[];
  maxLimit: number;
};

export async function fetchHomePopularConfig(): Promise<HomePopularConfig> {
  const res = await authorizedFetch('/admin/shop-catalog/popular');
  return parseCatalogResponse<HomePopularConfig>(res);
}

export async function updateHomePopularConfig(
  input: Partial<HomePopularConfig>,
): Promise<HomePopularConfig> {
  const res = await authorizedFetch('/admin/shop-catalog/popular', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseCatalogResponse<HomePopularConfig>(res);
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

export type HomeAdSlideInput = {
  title: string;
  body: string;
  backgroundCss: string;
  sortOrder?: number;
  isActive?: boolean;
};

export async function fetchHomeAdSlides(): Promise<HomeAdSlide[]> {
  const res = await authorizedFetch('/admin/home-ads/slides');
  return parseCatalogResponse<HomeAdSlide[]>(res);
}

export async function createHomeAdSlide(input: HomeAdSlideInput): Promise<HomeAdSlide> {
  const res = await authorizedFetch('/admin/home-ads/slides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseCatalogResponse<HomeAdSlide>(res);
}

export async function updateHomeAdSlide(
  id: string,
  input: Partial<HomeAdSlideInput>,
): Promise<HomeAdSlide> {
  const res = await authorizedFetch(`/admin/home-ads/slides/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseCatalogResponse<HomeAdSlide>(res);
}

export async function deleteHomeAdSlide(id: string): Promise<void> {
  const res = await authorizedFetch(`/admin/home-ads/slides/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await parseJson<{ message?: string | string[] }>(res);
    throw new Error(extractMessage(data, res));
  }
}

export async function uploadHomeAdSlideImage(id: string, file: File): Promise<HomeAdSlide> {
  const form = new FormData();
  form.append('file', file);
  const res = await authorizedFetch(`/admin/home-ads/slides/${encodeURIComponent(id)}/image`, {
    method: 'POST',
    body: form,
  });
  return parseCatalogResponse<HomeAdSlide>(res);
}

export async function clearHomeAdSlideImage(id: string): Promise<HomeAdSlide> {
  const res = await authorizedFetch(`/admin/home-ads/slides/${encodeURIComponent(id)}/image`, {
    method: 'DELETE',
  });
  return parseCatalogResponse<HomeAdSlide>(res);
}

export type ShopCatalogSection = {
  id: string;
  title: string;
  description: string;
  productIds: string[];
};

export type ShopCatalogLayout = {
  homeFeaturedProductIds: string[];
  shopSections: ShopCatalogSection[];
};

/** Also drives the public shop website — this is the same layout served at GET /shop/catalog/layout. */
export async function fetchShopCatalogLayout(): Promise<ShopCatalogLayout> {
  const res = await authorizedFetch('/admin/shop-catalog/layout');
  return parseCatalogResponse<ShopCatalogLayout>(res);
}

export async function updateShopCatalogLayout(
  input: Partial<ShopCatalogLayout>,
): Promise<ShopCatalogLayout> {
  const res = await authorizedFetch('/admin/shop-catalog/layout', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseCatalogResponse<ShopCatalogLayout>(res);
}

// --- Points (loyalty) & wallet (stored money) — two distinct balances. ---

export type AdminCustomerDetail = {
  id: string;
  phoneE164: string;
  displayName: string | null;
  wallet: { pointsCached: number } | null;
  ledgerEntries: LoyaltyLedgerEntry[];
};

export async function fetchCustomerDetail(id: string): Promise<AdminCustomerDetail> {
  const res = await authorizedFetch(`/admin/customers/${encodeURIComponent(id)}`);
  return parseCatalogResponse<AdminCustomerDetail>(res);
}

export type LoyaltyLedgerEntry = {
  id: string;
  customerId: string;
  customerPhone?: string;
  deltaPoints: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  reason: string;
  createdAt: string;
};

export async function adjustCustomerLoyalty(
  id: string,
  input: { deltaPoints: number; reason: string; referenceType?: string; referenceId?: string },
): Promise<{ customerId: string; pointsBalance: number }> {
  const res = await authorizedFetch(`/admin/customers/${encodeURIComponent(id)}/loyalty/adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseCatalogResponse<{ customerId: string; pointsBalance: number }>(res);
}

export async function fetchLoyaltyLedgerGlobal(limit = 20): Promise<LoyaltyLedgerEntry[]> {
  const res = await authorizedFetch(`/admin/loyalty-ledger?limit=${limit}`);
  return parseCatalogResponse<LoyaltyLedgerEntry[]>(res);
}

export type WalletTxnType = 'TOPUP' | 'SPEND' | 'REFUND' | 'MANUAL_ADJUSTMENT' | 'PROMOTIONAL_BONUS' | 'REVERSAL';

export type WalletSummary = {
  walletId: string;
  customerId: string;
  currentWalletBalance: number;
  lifetimeTopUpAmount: number;
  lifetimeSpentAmount: number;
  manualAdjustmentTotal: number;
  promotionalCreditTotal: number;
  pendingCredit: number;
  isFrozen: boolean;
  updatedAt: string;
};

export type WalletLedgerEntry = {
  id: string;
  customerId: string;
  customerPhone?: string;
  type: WalletTxnType;
  amountCents: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  createdByType: string;
  createdBy: string | null;
  reversedByTxnId: string | null;
  createdAt: string;
};

export async function fetchCustomerWallet(
  id: string,
): Promise<{ summary: WalletSummary; transactions: WalletLedgerEntry[] }> {
  const res = await authorizedFetch(`/admin/customers/${encodeURIComponent(id)}/wallet`);
  return parseCatalogResponse<{ summary: WalletSummary; transactions: WalletLedgerEntry[] }>(res);
}

export async function adjustCustomerWallet(
  id: string,
  input: { type: WalletTxnType; amountCents: number; reason: string; campaignCode?: string },
): Promise<{ entry: WalletLedgerEntry; summary: WalletSummary }> {
  const res = await authorizedFetch(`/admin/customers/${encodeURIComponent(id)}/wallet/adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseCatalogResponse<{ entry: WalletLedgerEntry; summary: WalletSummary }>(res);
}

export async function reverseWalletTransaction(
  id: string,
  transactionId: string,
  reason: string,
): Promise<{ original: WalletLedgerEntry; reversal: WalletLedgerEntry; summary: WalletSummary }> {
  const res = await authorizedFetch(
    `/admin/customers/${encodeURIComponent(id)}/wallet/reverse/${encodeURIComponent(transactionId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    },
  );
  return parseCatalogResponse<{ original: WalletLedgerEntry; reversal: WalletLedgerEntry; summary: WalletSummary }>(res);
}

export async function setWalletFreeze(
  id: string,
  freeze: boolean,
): Promise<{ customerId: string; walletId: string; isFrozen: boolean; updatedAt: string }> {
  const res = await authorizedFetch(
    `/admin/customers/${encodeURIComponent(id)}/wallet/${freeze ? 'freeze' : 'unfreeze'}`,
    { method: 'POST' },
  );
  return parseCatalogResponse<{ customerId: string; walletId: string; isFrozen: boolean; updatedAt: string }>(res);
}

export async function fetchWalletLedgerGlobal(limit = 20): Promise<WalletLedgerEntry[]> {
  const res = await authorizedFetch(`/admin/wallet-ledger?limit=${limit}`);
  return parseCatalogResponse<WalletLedgerEntry[]>(res);
}

// --- Voucher campaigns (promo vouchers pushed to a member's wallet — distinct
// from the points-catalog vouchers surfaced elsewhere). ---

export type CampaignTemplateKey = 'WELCOME' | 'BIRTHDAY' | 'REFERRAL' | 'WINBACK' | 'SPEND_EARN' | 'CUSTOM';
export type CampaignVoucherType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_ITEM' | 'DELIVERY_DISCOUNT' | 'WALLET_TOPUP_CODE';
export type VoucherLifecycleStatus = 'ACTIVE' | 'LOCKED' | 'USED' | 'EXPIRED' | 'VOID';

export type CampaignTemplatePreset = {
  template: CampaignTemplateKey;
  codePrefix: string;
  voucherType: CampaignVoucherType;
  discountPercent?: number;
  discountAmountRM?: number;
  minSpendRM?: number;
  voucherValidDays: number;
  usageLimitPerUser: number;
  autoCreditTrigger: string | null;
  tncText: string;
};

export async function fetchCampaignTemplates(): Promise<CampaignTemplatePreset[]> {
  const res = await authorizedFetch('/admin/campaigns/templates');
  return parseCatalogResponse<CampaignTemplatePreset[]>(res);
}

export type CampaignSummary = {
  id: string;
  code: string;
  name: string;
  template: CampaignTemplateKey;
  voucherType: CampaignVoucherType;
  status: 'active' | 'scheduled' | 'ended' | 'paused';
  vouchersIssued: number;
  totalRedemptionCap: number | null;
  discountDisplay: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  linkedRewards: number;
  autoCreditTrigger: AutoCreditTrigger | null;
};

export async function fetchCampaigns(): Promise<CampaignSummary[]> {
  const res = await authorizedFetch('/admin/campaigns');
  return parseCatalogResponse<CampaignSummary[]>(res);
}

export type CampaignIssuedVoucher = {
  id: string;
  code: string;
  name: string;
  status: VoucherLifecycleStatus;
  expiresAt: string | null;
  usedAt: string | null;
  createdAt: string;
  customer: { id: string; displayName: string | null; phoneE164: string } | null;
};

export const AUTO_CREDIT_TRIGGERS = [
  'NEW_MEMBER',
  'BIRTHDAY',
  'REFERRAL_COUNT',
  'INACTIVE_DAYS',
  'MIN_PURCHASE',
] as const;
export type AutoCreditTrigger = (typeof AUTO_CREDIT_TRIGGERS)[number];

export type CampaignDetail = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  voucherType: CampaignVoucherType;
  percentageOff: number | null;
  fixedAmountOffRM: number | null;
  minSpendRM: number | null;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  voucherValidDays: number;
  usageLimitPerUser: number | null;
  totalRedemptionCap: number | null;
  tncText: string | null;
  /** null = manual issue only. MIN_PURCHASE's threshold is stored in sen; others are plain counts. */
  autoCreditTrigger: AutoCreditTrigger | null;
  autoCreditThreshold: number | null;
  vouchers: CampaignIssuedVoucher[];
  stats: Partial<Record<VoucherLifecycleStatus, number>>;
};

export async function fetchCampaignDetail(id: string): Promise<CampaignDetail> {
  const res = await authorizedFetch(`/admin/campaigns/${encodeURIComponent(id)}`);
  return parseCatalogResponse<CampaignDetail>(res);
}

export type CreateCampaignInput = {
  template: CampaignTemplateKey;
  name: string;
  description?: string;
  voucherType: CampaignVoucherType;
  discountPercent?: number;
  discountAmountRM?: number;
  minSpendRM?: number;
  trigger: {
    type: 'AUTO' | 'MANUAL' | 'POINTS_REDEEM';
    criteria?: AutoCreditTrigger;
    /** Referral count, days inactive, or RM spend (MIN_PURCHASE only — converted to sen server-side). */
    thresholdValue?: number;
  };
  startsAt: string;
  endsAt?: string;
  voucherValidDays?: number;
  maxTotalIssued?: number;
  usageLimitPerUser?: number;
  tncText?: string;
};

export async function createCampaign(input: CreateCampaignInput): Promise<CampaignSummary> {
  const res = await authorizedFetch('/admin/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseCatalogResponse<CampaignSummary>(res);
}

export type UpdateCampaignInput = Partial<{
  name: string;
  description: string;
  discountPercent: number;
  discountAmountRM: number;
  minSpendRM: number;
  startsAt: string;
  endsAt: string;
  voucherValidDays: number;
  maxTotalIssued: number;
  usageLimitPerUser: number;
  tncText: string;
  isActive: boolean;
  /** '' clears the trigger (manual issue only). */
  autoCreditTrigger: AutoCreditTrigger | '';
  autoCreditThresholdValue: number;
}>;

export async function updateCampaign(id: string, input: UpdateCampaignInput): Promise<CampaignDetail> {
  const res = await authorizedFetch(`/admin/campaigns/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseCatalogResponse<CampaignDetail>(res);
}

export async function deleteCampaign(id: string): Promise<void> {
  const res = await authorizedFetch(`/admin/campaigns/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await parseJson<{ message?: string | string[] }>(res);
    throw new Error(extractMessage(data, res));
  }
}

export async function issueCampaignVoucherToCustomer(
  campaignId: string,
  customerId: string,
  input: { expiresAt?: string; reason?: string } = {},
): Promise<CampaignIssuedVoucher> {
  const res = await authorizedFetch(
    `/admin/campaigns/${encodeURIComponent(campaignId)}/issue/${encodeURIComponent(customerId)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
  );
  return parseCatalogResponse<CampaignIssuedVoucher>(res);
}

export async function issueCampaignToAllActive(
  campaignId: string,
  reason?: string,
): Promise<{ issued: number; failed: number; skipped: number; eligible: number }> {
  const res = await authorizedFetch(`/admin/campaigns/${encodeURIComponent(campaignId)}/issue-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  return parseCatalogResponse<{ issued: number; failed: number; skipped: number; eligible: number }>(res);
}

export async function revokeCampaignVoucher(voucherId: string, reason?: string): Promise<void> {
  const res = await authorizedFetch(`/admin/campaigns/vouchers/${encodeURIComponent(voucherId)}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const data = await parseJson<{ message?: string | string[] }>(res);
    throw new Error(extractMessage(data, res));
  }
}

// --- In-store voucher redemption (member's active vouchers, either points-
// catalog or campaign-issued, marked used to prevent reuse after the discount
// is applied manually at the till). ---

export type RedeemableVoucher = {
  id: string;
  source: 'CATALOG' | 'CAMPAIGN';
  code: string;
  title: string;
  discountLabel: string;
  expiresAt: string | null;
  locked: boolean;
};

export async function fetchRedeemableVouchers(customerId: string): Promise<RedeemableVoucher[]> {
  const res = await authorizedFetch(`/admin/customers/${encodeURIComponent(customerId)}/vouchers/redeemable`);
  return parseCatalogResponse<RedeemableVoucher[]>(res);
}

export async function redeemVoucherInStore(
  customerId: string,
  voucherId: string,
  source: 'CATALOG' | 'CAMPAIGN',
  reason?: string,
): Promise<void> {
  const res = await authorizedFetch(
    `/admin/customers/${encodeURIComponent(customerId)}/vouchers/${encodeURIComponent(voucherId)}/redeem`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, reason }) },
  );
  if (!res.ok) {
    const data = await parseJson<{ message?: string | string[] }>(res);
    throw new Error(extractMessage(data, res));
  }
}

// --- Bento discount vouchers — shared promo codes typed in at Bento checkout,
// not tied to any one member (distinct from the two voucher systems above). ---

export type BentoVoucher = {
  id: string;
  code: string;
  description: string | null;
  amountOffCents: number;
  minSpendCents: number | null;
  startsAt: string;
  endsAt: string;
  redemptionCap: number;
  redeemedCount: number;
  remaining: number;
  isActive: boolean;
  createdAt: string;
};

export async function fetchBentoVouchers(): Promise<BentoVoucher[]> {
  const res = await authorizedFetch('/admin/bento-vouchers');
  return parseCatalogResponse<BentoVoucher[]>(res);
}

export type BentoVoucherInput = {
  code?: string;
  description?: string;
  amountOffCents?: number;
  minSpendCents?: number;
  startsAt?: string;
  endsAt?: string;
  redemptionCap?: number;
  isActive?: boolean;
};

export async function createBentoVoucher(input: BentoVoucherInput): Promise<BentoVoucher> {
  const res = await authorizedFetch('/admin/bento-vouchers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseCatalogResponse<BentoVoucher>(res);
}

export async function updateBentoVoucher(id: string, input: BentoVoucherInput): Promise<BentoVoucher> {
  const res = await authorizedFetch(`/admin/bento-vouchers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseCatalogResponse<BentoVoucher>(res);
}

export async function deleteBentoVoucher(id: string): Promise<void> {
  const res = await authorizedFetch(`/admin/bento-vouchers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await parseJson<{ message?: string | string[] }>(res);
    throw new Error(extractMessage(data, res));
  }
}

// --- Gift rewards (points-redeemable reward catalog) ---

export type RewardType = 'FREE_ITEM' | 'DISCOUNT_VOUCHER' | 'LIMITED_TIME';

export type RewardCatalogEntry = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  rewardType: RewardType;
  pointsCost: number;
  voucherCampaignId: string | null;
  visibleInRewardsWallet: boolean;
  isActive: boolean;
  tncText: string | null;
  createdAt: string;
};

export async function fetchRewardCatalog(): Promise<RewardCatalogEntry[]> {
  const res = await authorizedFetch('/admin/rewards-workflow/reward-catalog');
  return parseCatalogResponse<RewardCatalogEntry[]>(res);
}

export type RewardCatalogInput = {
  code?: string;
  name?: string;
  description?: string;
  rewardType?: RewardType;
  pointsCost?: number;
  voucherCampaignId?: string;
  isActive?: boolean;
  visibleInRewardsWallet?: boolean;
  tncText?: string;
};

export async function createRewardCatalogEntry(input: RewardCatalogInput): Promise<RewardCatalogEntry> {
  const res = await authorizedFetch('/admin/rewards-workflow/reward-catalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseCatalogResponse<RewardCatalogEntry>(res);
}

export async function updateRewardCatalogEntry(id: string, input: RewardCatalogInput): Promise<RewardCatalogEntry> {
  const res = await authorizedFetch(`/admin/rewards-workflow/reward-catalog/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseCatalogResponse<RewardCatalogEntry>(res);
}

export async function deleteRewardCatalogEntry(id: string): Promise<void> {
  const res = await authorizedFetch(`/admin/rewards-workflow/reward-catalog/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await parseJson<{ message?: string | string[] }>(res);
    throw new Error(extractMessage(data, res));
  }
}

