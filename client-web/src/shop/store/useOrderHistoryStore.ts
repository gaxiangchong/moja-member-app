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
  placedAt: string;
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
  }) => void;
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
          id: newOrderId(),
          placedAt: new Date().toISOString(),
          totalCents: input.totalCents,
          fulfillmentSummary: input.fulfillmentSummary,
          lines: input.lines,
        };
        set((s) => ({ orders: [entry, ...s.orders] }));
      },
    }),
    { name: 'moja-member-order-history' },
  ),
);
