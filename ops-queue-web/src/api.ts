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

export async function fetchQueueOrders(
  apiKey: string,
  baseUrl: string = defaultBase,
): Promise<QueueOrdersResponse> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/ops/queue/orders`, {
    headers: { 'x-ops-api-key': apiKey },
  });
  const data = await parseJson<QueueOrdersResponse & { message?: string | string[] }>(res);
  if (!res.ok) {
    throw new Error(formatHttpError(res.status, data));
  }
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
  if (!res.ok) {
    throw new Error(formatHttpError(res.status, data));
  }
  return data as QueueOrderDetail;
}

export async function completeQueueOrder(
  apiKey: string,
  orderId: string,
  baseUrl: string = defaultBase,
): Promise<void> {
  const res = await fetch(
    `${baseUrl.replace(/\/$/, '')}/ops/queue/orders/${encodeURIComponent(orderId)}/complete`,
    { method: 'PATCH', headers: { 'x-ops-api-key': apiKey } },
  );
  if (!res.ok) {
    const data = await parseJson<{ message?: string | string[] }>(res);
    throw new Error(formatHttpError(res.status, data));
  }
}
