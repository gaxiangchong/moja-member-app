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

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || res.statusText);
  }
}

export async function requestOtp(phone: string): Promise<{
  sent: boolean;
  channel?: string;
  expiresAt: string;
  _devCode?: string;
}> {
  const res = await fetch(`${base}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
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
    expiresAt: string;
    _devCode?: string;
  };
}

export async function verifyOtp(
  phone: string,
  code: string,
  opts?: { referralCode?: string | null },
): Promise<{ accessToken: string; customerId: string; status: string }> {
  const body: { phone: string; code: string; referralCode?: string } = { phone, code };
  const ref = opts?.referralCode?.trim();
  if (ref) body.referralCode = ref;
  const res = await fetch(`${base}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
    throw new Error(msg || `Verify failed (${res.status})`);
  }
  if (!data.accessToken) throw new Error('No access token returned');
  return {
    accessToken: data.accessToken,
    customerId: data.customerId!,
    status: data.status ?? '',
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
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${base}/customers/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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
  if (!res.ok) {
    throw new Error(
      typeof data.message === 'string' ? data.message : 'Failed to update profile',
    );
  }
  return data as MemberProfile;
}

export type MemberRewardsPayload = {
  wallet: { pointsBalance: number };
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
    };
  }>;
  rewards: Array<{
    id: string;
    code: string;
    title: string;
    description: string | null;
    pointsCost: number | null;
    isActive: boolean;
    imageUrl?: string | null;
    rewardCategory?: string | null;
  }>;
};

export type ShopCatalogProduct = {
  id: string;
  category: 'whole_cakes' | 'cake_slices' | 'drinks' | 'specials';
  name: string;
  shortDescription: string;
  description: string;
  imageUrl: string;
  basePriceCents: number;
  variants?: Array<{ id: string; label: string; priceCents: number }>;
};

export async function requestShopHandoff(): Promise<{
  handoffToken: string;
  expiresInSec: number;
  consumeUrl: string;
}> {
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${base}/auth/shop-handoff`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
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

export async function fetchMeRewards(): Promise<MemberRewardsPayload> {
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${base}/customers/me/rewards`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

export async function fetchMemberOrders(limit = 40): Promise<{ orders: MemberOrderRow[] }> {
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${base}/customers/me/orders?limit=${encodeURIComponent(String(limit))}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJson<{ orders?: MemberOrderRow[]; message?: string | string[] }>(res);
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
  return { orders: Array.isArray(data.orders) ? data.orders : [] };
}

export async function submitMemberOrder(payload: {
  totalCents: number;
  lines: SubmitMemberOrderLine[];
  fulfillmentSummary?: string[] | null;
}): Promise<SubmitMemberOrderResult> {
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${base}/customers/me/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await parseJson<SubmitMemberOrderResult & { message?: string | string[] }>(res);
  if (!res.ok) {
    const raw = data.message;
    const msg =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.join(', ')
          : JSON.stringify(data);
    throw new Error(msg || `Order failed (${res.status})`);
  }
  return data as SubmitMemberOrderResult;
}

export async function fetchShopCatalogProducts(): Promise<ShopCatalogProduct[]> {
  const res = await fetch(`${base}/shop/catalog/products`);
  const data = await parseJson<Array<ShopCatalogProduct> & { message?: string }>(res);
  if (!res.ok) {
    throw new Error(
      typeof data.message === 'string' ? data.message : 'Failed to load shop catalog',
    );
  }
  return (Array.isArray(data) ? data : []) as ShopCatalogProduct[];
}
