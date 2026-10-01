import type { CartLine, DeliveryDraft, FulfillmentMethod } from '../types';

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
    errors.push('Choose Self pickup or Delivery.');
  }

  if (state.fulfillmentMethod === 'pickup') {
    if (!state.pickupDate) errors.push('Select a pickup date.');
    if (!state.pickupTime) errors.push('Select a pickup time.');
  }

  if (state.fulfillmentMethod === 'delivery') {
    const d = state.delivery;
    if ((d?.address.trim().length ?? 0) < 10) {
      errors.push('Enter the full delivery address (unit, street, area and postcode).');
    }
    if (!d?.contactName.trim()) errors.push('Enter the name of the person to contact.');
    const digits = (d?.contactPhone ?? '').replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      errors.push('Enter a valid contact phone number.');
    }
    if (!state.pickupDate) errors.push('Select the date the courier collects the order.');
    if (!state.pickupTime) errors.push('Select the time the courier collects the order.');
    if (!d?.arrangement) {
      errors.push('Choose who arranges the delivery: you, or Moja Maison.');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function fulfillmentSummaryLines(
  method: FulfillmentMethod | null,
  pickupDate: string | null,
  pickupTime: string | null,
  delivery?: DeliveryDraft,
): string[] {
  if (!method) return ['Not selected'];
  const d = pickupDate ?? '—';
  const t = pickupTime ?? '—';
  if (method === 'delivery') {
    return [
      'Delivery',
      `Date: ${d}`,
      `Time: ${t}`,
      `Deliver to: ${delivery?.address.trim() ?? '—'}`,
      `Contact: ${delivery?.contactName.trim() ?? '—'} · ${delivery?.contactPhone.trim() ?? '—'}`,
    ];
  }
  return ['Self pickup', `Date: ${d}`, `Time: ${t}`];
}
