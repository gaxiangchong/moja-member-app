/**
 * Delivery orders. Moja Maison does not run its own couriers or price the
 * delivery in the app: the member either books their own courier to collect
 * from the shop, or asks Moja Maison on WhatsApp to arrange one. Either way the
 * delivery charge is settled outside the order total, and has to be paid before
 * delivery can be arranged.
 */

export type DeliveryArrangement = 'SELF' | 'MOJA';

/** Who books the courier. */
export const DELIVERY_ARRANGEMENTS: DeliveryArrangement[] = ['SELF', 'MOJA'];

export type DeliverySettings = {
  /** Members can choose Delivery at checkout. */
  enabled: boolean;
  /**
   * Moja Maison's WhatsApp number for delivery help: digits only, with country
   * code (e.g. 60123456789). Empty means "not set" — the WhatsApp button is hidden.
   */
  whatsappNumber: string;
  /** Members can choose "Ship to me" for nationwide products (cookies). */
  shippingEnabled: boolean;
  /** Flat parcel fee in sen, added to the order total for a shipped order. */
  shippingFeeCents: number;
  /**
   * The fee is waived when the goods (after any discount) come to more than
   * this many sen. 0 = never waived.
   */
  freeShippingOverCents: number;
  /**
   * Local delivery (cakes, by courier) only goes to addresses whose postcode
   * starts with one of these (e.g. "47", "50450"). Empty = no restriction.
   */
  localDeliveryPostcodes: string[];
};

export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = {
  enabled: true,
  whatsappNumber: '',
  shippingEnabled: true,
  shippingFeeCents: 1000,
  freeShippingOverCents: 10000,
  localDeliveryPostcodes: [],
};

/**
 * Whether a typed address is inside the local delivery area: it needs a
 * 5-digit postcode that starts with one of `prefixes`. With no prefixes set
 * every address is accepted.
 */
export function addressInLocalArea(
  address: string,
  prefixes: string[],
): boolean {
  if (prefixes.length === 0) return true;
  const postcodes = address.match(/\b\d{5}\b/g) ?? [];
  return postcodes.some((pc) => prefixes.some((p) => pc.startsWith(p)));
}

/** Accepts a list or a comma/space separated string of postcode prefixes (1-5 digits). */
export function normalizePostcodePrefixes(raw: unknown): string[] {
  if (raw == null || raw === '') return [];
  const parts = Array.isArray(raw)
    ? raw.map((x) =>
        typeof x === 'string' || typeof x === 'number' ? String(x) : '',
      )
    : typeof raw === 'string'
      ? raw.split(/[\s,;]+/)
      : null;
  if (!parts) {
    throw new DeliverySettingsError(
      'Local delivery areas must be a list of postcodes.',
    );
  }
  const out: string[] = [];
  for (const part of parts.map((x) => x.trim()).filter(Boolean)) {
    if (!/^\d{1,5}$/.test(part)) {
      throw new DeliverySettingsError(
        `"${part}" is not a postcode. Use 1 to 5 digits, e.g. 47 or 50450.`,
      );
    }
    if (!out.includes(part)) out.push(part);
  }
  if (out.length > 200) {
    throw new DeliverySettingsError('Too many local delivery areas (max 200).');
  }
  return out;
}

/** The parcel fee for an order whose goods come to `goodsCents` after any discount. */
export function shippingFeeFor(
  settings: Pick<
    DeliverySettings,
    'shippingFeeCents' | 'freeShippingOverCents'
  >,
  goodsCents: number,
): number {
  if (
    settings.freeShippingOverCents > 0 &&
    goodsCents > settings.freeShippingOverCents
  ) {
    return 0;
  }
  return settings.shippingFeeCents;
}

/** How a DELIVERY order travels: a local courier, or a parcel anywhere in the country. */
export type DeliveryMethod = 'LOCAL' | 'SHIPPING';

export class DeliverySettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliverySettingsError';
  }
}

/**
 * Digits only, with a country code. A Malaysian number typed locally
 * ("012-345 6789") gets 60 in place of the leading 0.
 */
export function normalizeWhatsappNumber(raw: unknown): string {
  if (raw == null) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `60${digits.slice(1)}`;
  if (digits.length < 9 || digits.length > 15) {
    throw new DeliverySettingsError(
      'WhatsApp number must include the country code, e.g. 60123456789.',
    );
  }
  return digits;
}

export function normalizeDeliverySettings(raw: unknown): DeliverySettings {
  if (raw == null) return { ...DEFAULT_DELIVERY_SETTINGS };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DeliverySettingsError('Delivery settings must be an object.');
  }
  const o = raw as Record<string, unknown>;
  if (o.enabled !== undefined && typeof o.enabled !== 'boolean') {
    throw new DeliverySettingsError('"enabled" must be true or false.');
  }
  if (
    o.shippingEnabled !== undefined &&
    typeof o.shippingEnabled !== 'boolean'
  ) {
    throw new DeliverySettingsError('"shippingEnabled" must be true or false.');
  }
  const fee = o.shippingFeeCents ?? DEFAULT_DELIVERY_SETTINGS.shippingFeeCents;
  if (
    typeof fee !== 'number' ||
    !Number.isInteger(fee) ||
    fee < 0 ||
    fee > 100_000
  ) {
    throw new DeliverySettingsError(
      'Shipping fee must be a whole number of sen between 0 and 100000.',
    );
  }
  const freeOver =
    o.freeShippingOverCents ?? DEFAULT_DELIVERY_SETTINGS.freeShippingOverCents;
  if (
    typeof freeOver !== 'number' ||
    !Number.isInteger(freeOver) ||
    freeOver < 0 ||
    freeOver > 10_000_000
  ) {
    throw new DeliverySettingsError(
      'The free-shipping amount must be a whole number of sen, or 0 for never.',
    );
  }
  return {
    enabled: o.enabled ?? DEFAULT_DELIVERY_SETTINGS.enabled,
    whatsappNumber: normalizeWhatsappNumber(o.whatsappNumber),
    shippingEnabled:
      o.shippingEnabled ?? DEFAULT_DELIVERY_SETTINGS.shippingEnabled,
    shippingFeeCents: fee,
    freeShippingOverCents: freeOver,
    localDeliveryPostcodes: normalizePostcodePrefixes(o.localDeliveryPostcodes),
  };
}

export type DeliveryDetails = {
  address: string;
  contactName: string;
  contactPhone: string;
  arrangement: DeliveryArrangement;
};

export class DeliveryDetailsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryDetailsError';
  }
}

/** Shipping is always arranged by Moja Maison, so the member is not asked who books it. */
export function validateShippingDetails(raw: unknown): DeliveryDetails {
  const o =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return validateDeliveryDetails({ ...o, arrangement: 'MOJA' });
}

/** The plain-text lines for a parcel order (no courier slot: it is posted within a few days). */
export function shippingSummaryLines(details: DeliveryDetails): string[] {
  return [
    'Shipping',
    'Posted within 2-5 days',
    `Ship to: ${details.address}`,
    `Contact: ${details.contactName} · ${details.contactPhone}`,
  ];
}

/** Checks what the member typed and tidies it. Throws a message fit to show them. */
export function validateDeliveryDetails(raw: unknown): DeliveryDetails {
  if (!raw || typeof raw !== 'object') {
    throw new DeliveryDetailsError(
      'Enter the delivery address and who to contact.',
    );
  }
  const o = raw as Record<string, unknown>;
  const address = String(o.address ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (address.length < 10) {
    throw new DeliveryDetailsError(
      'Enter the full delivery address (unit, street, area and postcode).',
    );
  }
  const contactName = String(o.contactName ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!contactName) {
    throw new DeliveryDetailsError('Enter the name of the person to contact.');
  }
  const phoneRaw = String(o.contactPhone ?? '').trim();
  const phoneDigits = phoneRaw.replace(/\D/g, '');
  if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    throw new DeliveryDetailsError('Enter a valid contact phone number.');
  }
  const contactPhone = phoneRaw.startsWith('+')
    ? `+${phoneDigits}`
    : phoneDigits;
  const arrangement = o.arrangement;
  if (arrangement !== 'SELF' && arrangement !== 'MOJA') {
    throw new DeliveryDetailsError(
      'Choose who arranges the delivery: you, or Moja Maison.',
    );
  }
  return {
    address: address.slice(0, 400),
    contactName: contactName.slice(0, 120),
    contactPhone: contactPhone.slice(0, 32),
    arrangement,
  };
}

/**
 * The plain-text lines shown for the order everywhere — kitchen queue, admin
 * orders, the member's Orders tab. Built on the server so what staff see
 * always matches what was stored.
 */
export function deliverySummaryLines(
  details: DeliveryDetails,
  scheduledDate: string | null,
  scheduledSlot: string | null,
): string[] {
  return [
    'Delivery',
    `Date: ${scheduledDate ?? '—'}`,
    `Time: ${scheduledSlot ?? '—'}`,
    `Deliver to: ${details.address}`,
    `Contact: ${details.contactName} · ${details.contactPhone}`,
    details.arrangement === 'SELF'
      ? 'Delivery: customer books their own courier to collect from the shop'
      : 'Delivery: Moja Maison to help arrange a courier (via WhatsApp)',
    'Delivery charge is paid separately and must be settled before delivery is arranged',
  ];
}
