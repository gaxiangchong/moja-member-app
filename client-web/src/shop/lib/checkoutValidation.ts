import type { CartLine, DeliveryDraft, FulfillmentMethod, PickupBy } from '../types';

export type CheckoutDraft = {
  cart: CartLine[];
  fulfillmentMethod: FulfillmentMethod | null;
  pickupDate: string | null;
  pickupTime: string | null;
  delivery?: DeliveryDraft;
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
    errors.push('Choose Self pickup or Ship nationwide.');
  }

  if (state.fulfillmentMethod === 'pickup') {
    if (!state.pickupDate) errors.push('Select a pickup date.');
    if (!state.pickupTime) errors.push('Select a pickup time.');
  }

  if (state.fulfillmentMethod === 'shipping') {
    const d = state.delivery;
    if ((d?.address.trim().length ?? 0) < 10) {
      errors.push('Enter the full address to ship to (unit, street, area, postcode and state).');
    }
    if (!d?.contactName.trim()) errors.push('Enter the name of the person receiving the parcel.');
    const digits = (d?.contactPhone ?? '').replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      errors.push('Enter a valid contact phone number.');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function fulfillmentSummaryLines(
  method: FulfillmentMethod | null,
  pickupDate: string | null,
  pickupTime: string | null,
  delivery?: DeliveryDraft,
  pickupBy: PickupBy = 'self',
): string[] {
  if (!method) return ['Not selected'];
  const d = pickupDate ?? '—';
  const t = pickupTime ?? '—';
  if (method === 'shipping') {
    return [
      'Shipping',
      'Posted within 2-5 days',
      `Ship to: ${delivery?.address.trim() ?? '—'}`,
      `Contact: ${delivery?.contactName.trim() ?? '—'} · ${delivery?.contactPhone.trim() ?? '—'}`,
    ];
  }
  const lines = ['Self pickup', `Date: ${d}`, `Time: ${t}`];
  if (pickupBy === 'courier') {
    lines.push("Collected by: customer's own courier");
  }
  return lines;
}
