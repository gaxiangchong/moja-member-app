const defaultBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3153';

export type QueueOrderLine = {
  id: string;
  productId: string;
  name: string;
  variantLabel: string | null;
  unitPriceCents: number;
  qty: number;
  imageUrl?: string | null;
};

export type QueueOrderSummary = {
  id: string;
  orderNumber: number;
  placedAt: string;
  completedAt: string | null;
  totalCents: number;
  status: string;
  fulfillmentSummary: string[];
  customerDisplayName: string | null;
  customerPhoneMasked: string;
  lineCount: number;
  lines: QueueOrderLine[];
};

export type QueueOrdersResponse = {
  pending: QueueOrderSummary[];
  history: QueueOrderSummary[];
};

export type QueueOrderDetail = {
  id: string;
  orderNumber: number;
  placedAt: string;
  completedAt: string | null;
  totalCents: number;
  status: string;
  fulfillmentSummary: string[];
  customer: {
    id: string;
    displayName: string | null;
    phoneE164: string;
  };
  lines: QueueOrderLine[];
};

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || res.statusText);
  }
}

function formatHttpError(
  status: number,
  data: { message?: string | string[] },
): string {
  const m = data.message;
  if (typeof m === 'string') return m;
  if (Array.isArray(m)) return m.join(', ');
  return `Request failed (${status})`;
}

/** Dispatched when the ops API key is rejected with 401 (invalid/rotated key). */
export const SESSION_EXPIRED_EVENT = 'moja:ops-session-expired';

const SESSION_EXPIRED_MESSAGE =
  'Your session has expired. Please sign in again.';

/**
 * Reject unauthorized responses with a friendly re-login message and notify the
 * app shell (which drops back to the login screen). Otherwise surface the
 * server's error text as before.
 */
function assertOk(res: Response, data: { message?: string | string[] }): void {
  if (res.status === 401) {
    try {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    } catch {
      /* no window (non-browser env) */
    }
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  if (!res.ok) {
    throw new Error(formatHttpError(res.status, data));
  }
}

export async function fetchQueueOrders(
  apiKey: string,
  baseUrl: string = defaultBase,
): Promise<QueueOrdersResponse> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/ops/queue/orders`, {
    headers: { 'x-ops-api-key': apiKey },
  });
  const data = await parseJson<QueueOrdersResponse & { message?: string | string[] }>(res);
  assertOk(res, data);
  return data as QueueOrdersResponse;
}

export async function fetchQueueOrderDetail(
  apiKey: string,
  orderId: string,
  baseUrl: string = defaultBase,
): Promise<QueueOrderDetail> {
  const res = await fetch(
    `${baseUrl.replace(/\/$/, '')}/ops/queue/orders/${encodeURIComponent(orderId)}`,
    { headers: { 'x-ops-api-key': apiKey } },
  );
  const data = await parseJson<QueueOrderDetail & { message?: string | string[] }>(res);
  assertOk(res, data);
  return data as QueueOrderDetail;
}

export async function completeQueueOrder(
  apiKey: string,
  orderToken: string,
  baseUrl: string = defaultBase,
): Promise<{ orderNumber: number }> {
  const apiRoot = baseUrl.replace(/\/$/, '');
  const isNum = orderToken.startsWith('NUM:');
  const path = isNum
    ? `${apiRoot}/ops/queue/orders/by-number/${encodeURIComponent(orderToken.slice(4))}/complete`
    : `${apiRoot}/ops/queue/orders/${encodeURIComponent(orderToken)}/complete`;
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'x-ops-api-key': apiKey },
  });
  const data = await parseJson<{ message?: string | string[]; orderNumber?: number }>(res);
  assertOk(res, data);
  return { orderNumber: Number(data.orderNumber) || 0 };
}

export type TimesheetClockResponse = {
  ok: boolean;
  employee?: { id: string; employeeCode: string; displayName: string };
  entry?: { id: string; clockInAt: string; clockOutAt?: string };
};

export async function timesheetClockIn(
  apiKey: string,
  employeeCode: string,
  baseUrl: string = defaultBase,
): Promise<TimesheetClockResponse> {
  const res = await fetch(
    `${baseUrl.replace(/\/$/, '')}/ops/queue/timesheet/clock-in`,
    {
      method: 'POST',
      headers: {
        'x-ops-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ employeeCode }),
    },
  );
  const data = await parseJson<TimesheetClockResponse & { message?: string | string[] }>(res);
  assertOk(res, data);
  return data as TimesheetClockResponse;
}

export async function timesheetClockOut(
  apiKey: string,
  employeeCode: string,
  baseUrl: string = defaultBase,
): Promise<TimesheetClockResponse> {
  const res = await fetch(
    `${baseUrl.replace(/\/$/, '')}/ops/queue/timesheet/clock-out`,
    {
      method: 'POST',
      headers: {
        'x-ops-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ employeeCode }),
    },
  );
  const data = await parseJson<TimesheetClockResponse & { message?: string | string[] }>(res);
  assertOk(res, data);
  return data as TimesheetClockResponse;
}

export type BentoPickupLookup = {
  pickupCode: string;
  deliveryDate: string;
  customerDisplayName: string | null;
  customerPhoneMasked: string;
  summary: {
    totalPacks: number;
    lunchCount: number;
    dinnerCount: number;
    regular: number;
    vegetarian: number;
    regularBrown: number;
    vegetarianBrown: number;
    withDrink: number;
  };
  pendingCount: number;
  alreadyCollected: boolean;
  nothingScheduled: boolean;
  deliveries: Array<{
    id: string;
    status: string;
    includesLunch: boolean;
    includesDinner: boolean;
  }>;
};

export async function fetchBentoPickupLookup(
  apiKey: string,
  pickupCode: string,
  baseUrl: string = defaultBase,
): Promise<BentoPickupLookup> {
  const res = await fetch(
    `${baseUrl.replace(/\/$/, '')}/ops/queue/bento/lookup/${encodeURIComponent(pickupCode)}`,
    { headers: { 'x-ops-api-key': apiKey } },
  );
  const data = await parseJson<BentoPickupLookup & { message?: string | string[] }>(res);
  assertOk(res, data);
  return data as BentoPickupLookup;
}

export type KitchenStockItem = {
  id: string;
  name: string;
  category: string;
  availableQty: number | null;
  soldOut: boolean;
};

export async function fetchKitchenStock(
  apiKey: string,
  baseUrl: string = defaultBase,
): Promise<KitchenStockItem[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/ops/kitchen/stock`, {
    headers: { 'x-ops-api-key': apiKey },
  });
  const data = await parseJson<KitchenStockItem[] & { message?: string | string[] }>(res);
  assertOk(res, data as unknown as { message?: string | string[] });
  return data as KitchenStockItem[];
}

export async function setKitchenStockQty(
  apiKey: string,
  productId: string,
  qty: number,
  baseUrl: string = defaultBase,
): Promise<void> {
  const res = await fetch(
    `${baseUrl.replace(/\/$/, '')}/ops/kitchen/stock/${encodeURIComponent(productId)}`,
    {
      method: 'PATCH',
      headers: {
        'x-ops-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ qty }),
    },
  );
  const data = await parseJson<{ message?: string | string[] }>(res);
  assertOk(res, data);
}

export async function collectBentoPickup(
  apiKey: string,
  pickupCode: string,
  baseUrl: string = defaultBase,
): Promise<{ pickupCode: string; deliveryDate: string; collectedCount: number; status: string }> {
  const res = await fetch(
    `${baseUrl.replace(/\/$/, '')}/ops/queue/bento/collect/${encodeURIComponent(pickupCode)}`,
    {
      method: 'PATCH',
      headers: { 'x-ops-api-key': apiKey },
    },
  );
  const data = await parseJson<{ message?: string | string[]; pickupCode?: string }>(res);
  assertOk(res, data);
  return data as { pickupCode: string; deliveryDate: string; collectedCount: number; status: string };
}

// ---------------------------------------------------------------------------
// Member desk (#/member): look up a member by phone, register a walk-in.
// ---------------------------------------------------------------------------

/** What the member has to do before they can sign in on their own phone. */
export type MemberNextStep =
  | 'activate_in_app'
  | 'recover_via_otp'
  | 'needs_email'
  | 'ready';

export type OpsMemberProfile = {
  id: string;
  phoneE164?: string;
  displayName: string | null;
  email: string | null;
  birthday?: string | null;
  gender?: string | null;
  address?: string | null;
  status: string;
  memberTier: string;
  marketingConsent: boolean;
  tags?: string[];
  notes?: string | null;
  preferredStore?: string | null;
  referralCode: string | null;
  kitchenPickupCode: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  activated: boolean;
  canSelfRecover: boolean;
  pointsBalance?: number;
  walletBalanceCents?: number;
  activeVouchers?: number;
  orderCount?: number;
  lifetimeSpendCents?: number;
  lastOrderAt?: string | null;
};

export type OpsMemberLookupResult =
  | { found: false; phoneE164: string }
  | {
      found: true;
      phoneE164: string;
      nextStep: MemberNextStep;
      member: OpsMemberProfile;
    };

export type OpsMemberCreateResult = {
  phoneE164: string;
  nextStep: MemberNextStep;
  member: OpsMemberProfile;
  alreadyExisted: boolean;
};

export async function lookupMember(
  apiKey: string,
  phone: string,
  staffCode: string | undefined,
  baseUrl: string = defaultBase,
): Promise<OpsMemberLookupResult> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/ops/members/lookup`, {
    method: 'POST',
    headers: { 'x-ops-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, staffCode: staffCode || undefined }),
  });
  const data = await parseJson<OpsMemberLookupResult & { message?: string | string[] }>(res);
  assertOk(res, data as unknown as { message?: string | string[] });
  return data as OpsMemberLookupResult;
}

export async function registerMember(
  apiKey: string,
  input: {
    phone: string;
    displayName?: string;
    email?: string;
    birthday?: string;
    marketingConsent?: boolean;
    staffCode?: string;
  },
  baseUrl: string = defaultBase,
): Promise<OpsMemberCreateResult> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/ops/members`, {
    method: 'POST',
    headers: { 'x-ops-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await parseJson<OpsMemberCreateResult & { message?: string | string[] }>(res);
  assertOk(res, data as unknown as { message?: string | string[] });
  return data as OpsMemberCreateResult;
}
