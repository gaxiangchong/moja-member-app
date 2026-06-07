import type {
  BentoDietVariant,
  BentoMealOption,
  BentoPackage,
  BentoPackageCode,
  BentoQuote,
  BentoRiceType,
  BentoSubscription,
} from './bento/types';

const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3153';
const TOKEN_KEY = 'moja_bento_access_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
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
    !p.gender?.trim() ||
    !p.address?.trim()
  );
}

export async function fetchMe(): Promise<MemberProfile> {
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${base}/customers/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJson<
    MemberProfile & { message?: string; gender?: string | null; address?: string | null }
  >(res);
  if (!res.ok) throw new Error(data.message ?? 'Failed to load profile');
  return {
    id: data.id,
    phoneE164: data.phoneE164,
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
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${base}/customers/me`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const data = await parseJson<MemberProfile & { message?: string }>(res);
  if (!res.ok) throw new Error(data.message ?? 'Failed to update profile');
  return {
    id: data.id,
    phoneE164: data.phoneE164,
    displayName: data.displayName ?? null,
    email: data.email ?? null,
    birthday: data.birthday ?? null,
    gender: data.gender ?? null,
    address: data.address ?? null,
  };
}

async function authFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = await parseJson<T & { message?: string | string[] }>(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data;
}

export async function fetchBentoPackages(): Promise<{
  packages: BentoPackage[];
  newcomerEligible: boolean;
}> {
  const data = (await authFetch('/bento/packages')) as {
    packages: BentoPackage[];
    newcomerEligible: boolean;
  };
  return {
    packages: data.packages ?? [],
    newcomerEligible: Boolean(data.newcomerEligible),
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
}) {
  return authFetch('/bento/subscriptions/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<{
    demoMode?: boolean;
    subscriptionId: string;
    redirectUrl?: string | null;
    totalCents?: number;
  }>;
}

export type WeeklyMenuMeal = {
  title: string;
  description: string;
  /** Regular / non-vegetarian dish (default). */
  dish: string;
  /** Vegetarian dish (shown when the Veg toggle is on). */
  dishVeg: string;
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

export type WeeklyMenuPayload = {
  weekStart: string;
  optedIn: boolean | null;
  showPrompt: boolean;
  menu: {
    weekStart: string;
    weekEnd: string;
    minScheduleLeadDays: number;
    days: WeeklyMenuDay[];
  };
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

export async function scheduleBentoSubscription(
  subscriptionId: string,
  body: {
    slots: Array<{
      date: string;
      includeLunch: boolean;
      includeDinner: boolean;
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

export async function fetchPaymentsConfig(): Promise<{ paymentsDemoMode: boolean }> {
  const res = await fetch(`${base}/payments/config`);
  const data = await parseJson<{ paymentsDemoMode?: boolean; message?: string }>(res);
  if (!res.ok) throw new Error(errMsg(data));
  return { paymentsDemoMode: Boolean(data.paymentsDemoMode) };
}

export async function fetchShopChannels(): Promise<Array<{ code: string; label: string }>> {
  const res = await fetch(`${base}/payments/xendit/shop-channels`);
  const data = await parseJson<{ channels?: Array<{ code: string; label: string }> }>(res);
  return data.channels ?? [];
}
