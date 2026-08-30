import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { cartSubtotalCents, computeDiscountCents } from '../lib/pricing';
import type { CartLine, FulfillmentMethod, MockReward, MockVoucher } from '../types';

function newLineId(): string {
  return `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

type ShopState = {
  cart: CartLine[];
  fulfillmentMethod: FulfillmentMethod | null;
  pickupDate: string | null;
  pickupTime: string | null;
  appliedVoucher: MockVoucher | null;
  appliedReward: MockReward | null;

  addToCart: (input: {
    productId: string;
    name: string;
    imageUrl: string;
    unitPriceCents: number;
    qty: number;
    variantLabel?: string;
    notes?: string;
  }) => void;
  setLineQty: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  clearCart: () => void;
  importExternalCart: (
    lines: Array<{
      productId: string;
      name: string;
      imageUrl: string;
      unitPriceCents: number;
      qty: number;
      variantLabel?: string;
    }>,
  ) => void;

  setFulfillmentMethod: (m: FulfillmentMethod | null) => void;
  setPickupDate: (isoDate: string | null) => void;
  setPickupTime: (timeHHmm: string | null) => void;

  applyVoucher: (v: MockVoucher | null) => void;
  applyReward: (r: MockReward | null) => void;

  resetCheckoutFields: () => void;
  resetAfterOrder: () => void;

  getSubtotalCents: () => number;
  getDiscountCents: () => number;
  getTotalCents: () => number;
  getCartItemCount: () => number;
};

// Persisted so a guest's cart survives a refresh or an in-app detour to
// sign in at checkout — sign-in never navigates away from the page, but this
// is cheap insurance against an accidental reload losing their cart.
export const useShopStore = create<ShopState>()(
  persist(
    (set, get) => ({
  cart: [],
  fulfillmentMethod: null,
  pickupDate: null,
  pickupTime: null,
  appliedVoucher: null,
  appliedReward: null,

  addToCart: (input) => {
    const { cart } = get();
    const notes = input.notes?.trim() || undefined;
    const variant = input.variantLabel?.trim() || undefined;

    const existing = cart.find(
      (l) =>
        l.productId === input.productId &&
        (l.variantLabel || '') === (variant || '') &&
        (l.notes || '') === (notes || ''),
    );

    if (existing) {
      set({
        cart: cart.map((l) =>
          l.lineId === existing.lineId ? { ...l, qty: l.qty + input.qty } : l,
        ),
      });
      return;
    }

    const line: CartLine = {
      lineId: newLineId(),
      productId: input.productId,
      name: input.name,
      imageUrl: input.imageUrl,
      unitPriceCents: input.unitPriceCents,
      qty: input.qty,
      variantLabel: variant,
      notes,
    };
    set({ cart: [...cart, line] });
  },

  setLineQty: (lineId, qty) => {
    const q = Math.max(0, Math.min(99, Math.floor(qty)));
    const { cart } = get();
    if (q === 0) {
      set({ cart: cart.filter((l) => l.lineId !== lineId) });
      return;
    }
    set({
      cart: cart.map((l) => (l.lineId === lineId ? { ...l, qty: q } : l)),
    });
  },

  removeLine: (lineId) => {
    set({ cart: get().cart.filter((l) => l.lineId !== lineId) });
  },

  clearCart: () => set({ cart: [] }),

  importExternalCart: (lines) => {
    const cart: CartLine[] = lines.map((input) => ({
      lineId: newLineId(),
      productId: input.productId,
      name: input.name,
      imageUrl: input.imageUrl,
      unitPriceCents: input.unitPriceCents,
      qty: input.qty,
      variantLabel: input.variantLabel?.trim() || undefined,
    }));
    set({
      cart,
      fulfillmentMethod: null,
      pickupDate: null,
      pickupTime: null,
      appliedVoucher: null,
      appliedReward: null,
    });
  },

  setFulfillmentMethod: (m) =>
    set({
      fulfillmentMethod: m,
      ...(m === 'in_store' ? { pickupDate: null, pickupTime: null } : {}),
    }),

  setPickupDate: (d) => set({ pickupDate: d }),
  setPickupTime: (t) => set({ pickupTime: t }),

  applyVoucher: (v) => set({ appliedVoucher: v, appliedReward: null }),
  applyReward: (r) => set({ appliedReward: r, appliedVoucher: null }),

  resetCheckoutFields: () =>
    set({
      fulfillmentMethod: null,
      pickupDate: null,
      pickupTime: null,
      appliedVoucher: null,
      appliedReward: null,
    }),

  resetAfterOrder: () =>
    set({
      cart: [],
      fulfillmentMethod: null,
      pickupDate: null,
      pickupTime: null,
      appliedVoucher: null,
      appliedReward: null,
    }),

  getSubtotalCents: () => cartSubtotalCents(get().cart),
  getDiscountCents: () =>
    computeDiscountCents(
      cartSubtotalCents(get().cart),
      get().appliedVoucher,
      get().appliedReward,
    ),
  getTotalCents: () => {
    const sub = cartSubtotalCents(get().cart);
    const disc = computeDiscountCents(sub, get().appliedVoucher, get().appliedReward);
    return Math.max(0, sub - disc);
  },
  getCartItemCount: () => get().cart.reduce((n, l) => n + l.qty, 0),
    }),
    {
      name: 'moja_shop_cart',
      // Skip appliedVoucher/appliedReward — they reference member-specific
      // promo data that can go stale across sessions; re-apply after reload.
      partialize: (state) => ({
        cart: state.cart,
        fulfillmentMethod: state.fulfillmentMethod,
        pickupDate: state.pickupDate,
        pickupTime: state.pickupTime,
      }),
    },
  ),
);
