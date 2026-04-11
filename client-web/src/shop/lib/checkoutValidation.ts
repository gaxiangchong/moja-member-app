import type { CartLine, FulfillmentMethod } from '../types';

export type CheckoutDraft = {
  cart: CartLine[];
  fulfillmentMethod: FulfillmentMethod | null;
  pickupDate: string | null;
  pickupTime: string | null;
  deliveryCompany: string | null;
  deliveryPickupTime: string | null;
};

export type CheckoutValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateCheckout(state: CheckoutDraft): CheckoutValidationResult {
  const errors: string[] = [];

  if (state.cart.length === 0) {
    errors.push('Your cart is empty. Add items before checkout.');
  }

  if (!state.fulfillmentMethod) {
    errors.push('Choose Self Pickup, In store, or Delivery.');
  }

  if (state.fulfillmentMethod === 'in_store') {
    return { valid: errors.length === 0, errors };
  }

  if (state.fulfillmentMethod === 'pickup') {
    if (!state.pickupDate) {
      errors.push('Select a pickup date.');
    }
    if (!state.pickupTime) {
      errors.push('Select a pickup time.');
    }
  }

  if (state.fulfillmentMethod === 'delivery') {
    if (!state.deliveryCompany?.trim()) {
      errors.push('Select or enter a delivery company / platform.');
    }
    if (!state.deliveryPickupTime?.trim()) {
      errors.push('Enter the expected rider pickup time.');
    }
  }

  return { valid: errors.length === 0, errors };
}

/** First line must stay stable — ops queue treats this as expedite / in-store. */
export const IN_STORE_FULFILLMENT_HEAD = 'In store · prepare now';

export function fulfillmentSummaryLines(
  method: FulfillmentMethod | null,
  pickupDate: string | null,
  pickupTime: string | null,
  deliveryCompany: string | null,
  deliveryPickupTime: string | null,
): string[] {
  if (!method) return ['Not selected'];
  if (method === 'in_store') {
    return [IN_STORE_FULFILLMENT_HEAD];
  }
  if (method === 'pickup') {
    const d = pickupDate ?? '—';
    const t = pickupTime ?? '—';
    return ['Self pickup', `Date: ${d}`, `Time: ${t}`];
  }
  return [
    'Delivery (customer-arranged)',
    `Platform: ${deliveryCompany ?? '—'}`,
    `Rider pickup: ${deliveryPickupTime ?? '—'}`,
  ];
}
