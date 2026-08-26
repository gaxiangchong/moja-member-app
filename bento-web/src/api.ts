import type {
  BentoDietVariant,
  BentoMealOption,
  BentoPackage,
  BentoPackageCode,
  BentoQuote,
  BentoRiceType,
  BentoSavingsBaseline,
  BentoSubscription,
} from './bento/types';

const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3153';
const TOKEN_KEY = 'moja_bento_access_token';

/** Resolve an internal `/uploads/…` asset path against the API origin. */
export function assetUrl(pathOrUrl: string): string {
  const s = (pathOrUrl || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `${base.replace(/\/$/, '')}${s.startsWith('/') ? s : `/${s}`}`;
}

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

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || res.statusText);
  }
}

function errMsg(data: { message?: string | string[] }): string {
  if (typeof data.message === 'string') return data.message;
  if (Array.isArray(data.message)) return data.message.join(', ');
  return JSON.stringify(data);
}

export async function lookupLogin(phone: string) {
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
  if (!res.ok) throw new Error(errMsg(data));
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
) {
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
    sent?: boolean;
    channel?: string;
    expiresAt?: string;
    _devCode?: string;
    message?: string | string[];
  }>(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data;
}

export async function verifyOtp(phone: string, code: string, email?: string) {
  const res = await fetch(`${base}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone,
      code,
      // This is the bento app — seed the member's product-interest tag.
      source: 'bento',
      ...(email?.trim() ? { email: email.trim() } : {}),
    }),
  });
  const data = await parseJson<{
    setupToken?: string;
    purpose?: string;
    message?: string | string[];
  }>(res);
  if (!res.ok) throw new Error(errMsg(data));
  if (!data.setupToken) throw new Error('No setup token returned');
  return {
    setupToken: data.setupToken,
    purpose: data.purpose === 'recovery' ? ('recovery' as const) : ('register' as const),
  };
}

export async function setInitialPin(setupToken: string, pin: string, pinConfirm: string) {
  const res = await fetch(`${base}/auth/pin/set-initial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupToken, pin, pinConfirm }),
  });
  const data = await parseJson<{ accessToken?: string; message?: string | string[] }>(res);
  if (!res.ok) throw new Error(errMsg(data));
  if (!data.accessToken) throw new Error('No access token returned');
  return { accessToken: data.accessToken };
}

export async function loginWithPin(phone: string, pin: string) {
  const res = await fetch(`${base}/auth/pin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin }),
  });
  const data = await parseJson<{ accessToken?: string; message?: string | string[] }>(res);
  if (!res.ok) throw new Error(errMsg(data));
  if (!data.accessToken) throw new Error('No access token returned');
  return { accessToken: data.accessToken };
}

export type MemberProfile = {
  id: string;
  phoneE164: string;
  kitchenPickupId?: string;
  displayName: string | null;
  email: string | null;
  birthday: string | null;
  gender: string | null;
  address: string | null;
};

export function isProfileIncomplete(p: MemberProfile): boolean {
  return (
    !p.displayName?.trim() ||
    !p.email?.trim() ||
    !p.birthday?.trim() ||
    !p.gender?.trim()
  );
}

export async function fetchMe(): Promise<MemberProfile> {
  const token = getToken();
  if (!token) throw new SessionExpiredError();
  const res = await fetch(`${base}/customers/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    handleSessionExpired();
    throw new SessionExpiredError();
  }
  const data = await parseJson<
    MemberProfile & { message?: string; gender?: string | null; address?: string | null; kitchenPickupId?: string }
  >(res);
  if (!res.ok) throw new Error(data.message ?? 'Failed to load profile');
  return {
    id: data.id,
    phoneE164: data.phoneE164,
    kitchenPickupId:
      typeof data.kitchenPickupId === 'string' ? data.kitchenPickupId : undefined,
    displayName: data.displayName ?? null,
    email: data.email ?? null,
    birthday: data.birthday ?? null,
    gender: data.gender ?? null,
    address: data.address ?? null,
  };
}

export async function updateMe(input: {
  displayName?: string;
  email?: string;
  birthday?: string;
  gender?: string;
  address?: string;
}): Promise<MemberProfile> {
  const token = getToken();
  if (!token) throw new SessionExpiredError();
  const res = await fetch(`${base}/customers/me`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (res.status === 401) {
    handleSessionExpired();
    throw new SessionExpiredError();
  }
  const data = await parseJson<MemberProfile & { message?: string; kitchenPickupId?: string }>(res);
  if (!res.ok) throw new Error(data.message ?? 'Failed to update profile');
  return {
    id: data.id,
    phoneE164: data.phoneE164,
    kitchenPickupId:
      typeof data.kitchenPickupId === 'string' ? data.kitchenPickupId : undefined,
    displayName: data.displayName ?? null,
    email: data.email ?? null,
    birthday: data.birthday ?? null,
    gender: data.gender ?? null,
    address: data.address ?? null,
  };
}

async function authFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  if (!token) throw new SessionExpiredError();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    handleSessionExpired();
    throw new SessionExpiredError();
  }
  const data = await parseJson<T & { message?: string | string[] }>(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data;
}

export async function fetchBentoPackages(): Promise<{
  packages: BentoPackage[];
  newcomerEligible: boolean;
  savingsBaseline: BentoSavingsBaseline | null;
  features: { drinksAndSoupEnabled: boolean };
}> {
  const data = (await authFetch('/bento/packages')) as {
    packages: BentoPackage[];
    newcomerEligible: boolean;
    savingsBaseline?: BentoSavingsBaseline | null;
    features?: { drinksAndSoupEnabled?: boolean };
  };
  return {
    packages: data.packages ?? [],
    newcomerEligible: Boolean(data.newcomerEligible),
    savingsBaseline: data.savingsBaseline ?? null,
    features: {
      drinksAndSoupEnabled: data.features?.drinksAndSoupEnabled !== false,
    },
  };
}

export async function fetchBentoMenu() {
  const res = await fetch(`${base}/bento/menu`);
  return parseJson(res);
}

export async function quoteBentoSubscription(body: {
  packageCode: BentoPackageCode;
  mealOption: BentoMealOption;
  lunchVariant: BentoDietVariant;
  dinnerVariant: BentoDietVariant;
  riceType: BentoRiceType;
  includeDrinkAddon: boolean;
  sets?: number;
  voucherCode?: string;
}): Promise<BentoQuote> {
  return authFetch('/bento/subscriptions/quote', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<BentoQuote>;
}

export async function checkoutBentoSubscription(body: {
  packageCode: BentoPackageCode;
  mealOption: BentoMealOption;
  lunchVariant: BentoDietVariant;
  dinnerVariant: BentoDietVariant;
  riceType: BentoRiceType;
  includeDrinkAddon: boolean;
  channelCode?: string;
  sets?: number;
  voucherCode?: string;
}) {
  return authFetch('/bento/subscriptions/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<{
    demoMode?: boolean;
    subscriptionId: string;
    subscriptionIds?: string[];
    referenceId?: string;
    redirectUrl?: string | null;
    totalCents?: number;
  }>;
}

export type PaymentIntentStatus = {
  referenceId: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
  purpose: string;
  channelCode: string;
  currency: string;
  amountCents: number;
  updatedAt: string;
};

/** Poll when TNG / ShopeePay does not redirect back to the app after payment. */
export async function fetchPaymentIntentStatus(
  referenceId: string,
): Promise<PaymentIntentStatus> {
  const data = await authFetch<PaymentIntentStatus & { message?: string }>(
    `/payments/intent/${encodeURIComponent(referenceId)}`,
  );
  return {
    referenceId: data.referenceId ?? referenceId,
    status: (data.status ?? 'UNKNOWN') as PaymentIntentStatus['status'],
    purpose: data.purpose ?? '',
    channelCode: data.channelCode ?? '',
    currency: data.currency ?? '',
    amountCents: typeof data.amountCents === 'number' ? data.amountCents : 0,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export type WeeklyMenuMeal = {
  title: string;
  description: string;
  /** Regular / non-vegetarian main dish (English). */
  dish: string;
  /** Vegetarian main dish (English). */
  dishVeg: string;
  /** Regular main dish in Chinese (optional). */
  dishZh: string;
  /** Vegetarian main dish in Chinese (optional). */
  dishVegZh: string;
  /** Regular dish description (English). */
  dishDesc: string;
  /** Regular dish description in Chinese (optional). */
  dishDescZh: string;
  /** Vegetarian dish description (English). */
  dishVegDesc: string;
  /** Vegetarian dish description in Chinese (optional). */
  dishVegDescZh: string;
  /** Meal photo URL (empty = client shows the icon tile). */
  image: string;
};

export type WeeklyMenuDay = {
  date: string;
  weekday: string;
  isSunday: boolean;
  /** Whether this day is closed (no meals) — admin-managed. */
  closed: boolean;
  lunch: WeeklyMenuMeal;
  dinner: WeeklyMenuMeal;
};

export type WeeklyMenuWeek = {
  weekStart: string;
  weekEnd: string;
  minScheduleLeadDays: number;
  days: WeeklyMenuDay[];
};

export type WeeklyMenuPayload = {
  weekStart: string;
  optedIn: boolean | null;
  showPrompt: boolean;
  /** Current week's menu (kept for backward compatibility). */
  menu: WeeklyMenuWeek;
  /** Consecutive weeks the app can scroll through (this week, next week, …). */
  weeks?: WeeklyMenuWeek[];
  minScheduleLeadDays: number;
};

export async function fetchWeeklyOptInStatus(): Promise<WeeklyMenuPayload> {
  return authFetch<WeeklyMenuPayload>('/bento/weekly-opt-in');
}

export async function setWeeklyOptIn(optedIn: boolean) {
  return authFetch('/bento/weekly-opt-in', {
    method: 'POST',
    body: JSON.stringify({ optedIn }),
  });
}

export type ScheduleRules = {
  minScheduleLeadDays: number;
  earliestPickupDate: string | null;
  earliestSchedulableDate: string;
  closedWeekdays: number[];
  closedDates: string[];
};

export async function fetchScheduleRules(): Promise<ScheduleRules> {
  return authFetch<ScheduleRules>('/bento/schedule-rules');
}

export async function fetchScheduleCapacity(
  from: string,
  to: string,
): Promise<{
  dailyCapacityPacks: number;
  rules: ScheduleRules;
  days: Array<{
    date: string;
    scheduledPacks: number;
    remainingPacks: number;
    isFull: boolean;
  }>;
}> {
  const q = new URLSearchParams({ from, to });
  return authFetch(`/bento/schedule-capacity?${q.toString()}`);
}

export async function scheduleBentoSubscription(
  subscriptionId: string,
  body: {
    slots: Array<{
      date: string;
      includeLunch: boolean;
      includeDinner: boolean;
      lunchQty?: number;
      dinnerQty?: number;
    }>;
  },
): Promise<BentoSubscription> {
  return authFetch<BentoSubscription>(`/bento/subscriptions/${subscriptionId}/schedule`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function completeDemoBentoSubscription(subscriptionId: string) {
  return authFetch('/payments/demo/complete-bento-subscription', {
    method: 'POST',
    body: JSON.stringify({ subscriptionId }),
  });
}

export async function fetchMyBentoSubscriptions(): Promise<BentoSubscription[]> {
  return authFetch<BentoSubscription[]>('/bento/subscriptions/me');
}

export async function fetchPaymentsConfig(): Promise<{ paymentsDemoMode: boolean; paymentsDisabled: boolean }> {
  const res = await fetch(`${base}/payments/config`);
  const data = await parseJson<{ paymentsDemoMode?: boolean; paymentsDisabled?: boolean; message?: string }>(res);
  if (!res.ok) throw new Error(errMsg(data));
  return { paymentsDemoMode: Boolean(data.paymentsDemoMode), paymentsDisabled: Boolean(data.paymentsDisabled) };
}

export async function fetchShopChannels(): Promise<Array<{ code: string; label: string }>> {
  const res = await fetch(`${base}/payments/xendit/shop-channels`);
  const data = await parseJson<{ channels?: Array<{ code: string; label: string }> }>(res);
  return data.channels ?? [];
}
