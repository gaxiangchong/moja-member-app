import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OrderLineSnapshot = {
  productId: string;
  name: string;
  imageUrl: string;
  unitPriceCents: number;
  qty: number;
  variantLabel?: string;
};

export type PastOrder = {
  id: string;
  orderNumber?: number;
  placedAt: string;
  preparingAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  fulfilmentType?: 'IN_STORE' | 'PICKUP' | 'DELIVERY';
  scheduledDate?: string | null;
  scheduledSlot?: string | null;
  deliveryFeeCents?: number;
  cancellable?: boolean;
  status?: string;
  totalCents: number;
  fulfillmentSummary: string[];
  lines: OrderLineSnapshot[];
};

type OrderHistoryState = {
  orders: PastOrder[];
  addOrder: (input: {
    lines: OrderLineSnapshot[];
    totalCents: number;
    fulfillmentSummary: string[];
    id?: string;
    orderNumber?: number;
    placedAt?: string;
    status?: string;
    completedAt?: string | null;
  }) => void;
  setOrdersFromApi: (orders: PastOrder[]) => void;
};

function newOrderId(): string {
  return `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useOrderHistoryStore = create<OrderHistoryState>()(
  persist(
    (set) => ({
      orders: [],
      addOrder: (input) => {
        const entry: PastOrder = {
          id: input.id ?? newOrderId(),
          orderNumber: input.orderNumber,
          placedAt: input.placedAt ?? new Date().toISOString(),
          completedAt: input.completedAt ?? null,
          status: input.status ?? 'placed',
          totalCents: input.totalCents,
          fulfillmentSummary: input.fulfillmentSummary,
          lines: input.lines,
        };
        set((s) => ({ orders: [entry, ...s.orders] }));
      },
      setOrdersFromApi: (orders) => set({ orders }),
    }),
    { name: 'moja-member-order-history' },
  ),
);
