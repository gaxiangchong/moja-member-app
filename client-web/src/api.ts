const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

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
): Promise<{ accessToken: string; customerId: string; status: string }> {
  const res = await fetch(`${base}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
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
  loyalty: { pointsBalance: number; walletId: string | null };
  createdAt: string;
  updatedAt: string;
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
