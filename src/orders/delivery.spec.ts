import {
  DEFAULT_DELIVERY_SETTINGS,
  DeliveryDetailsError,
  DeliverySettingsError,
  deliverySummaryLines,
  normalizeDeliverySettings,
  normalizeWhatsappNumber,
  addressInLocalArea,
  normalizePostcodePrefixes,
  shippingFeeFor,
  shippingSummaryLines,
  validateDeliveryDetails,
  validateShippingDetails,
} from './delivery';

const good = {
  address: 'No 12, Jalan SS2/24, Petaling Jaya, 47300 Selangor',
  contactName: 'Aisyah',
  contactPhone: '012-345 6789',
  arrangement: 'MOJA',
};

describe('validateDeliveryDetails', () => {
  it('accepts a full address, contact and arrangement, and tidies them', () => {
    expect(
      validateDeliveryDetails({ ...good, address: `  ${good.address}  \n` }),
    ).toEqual({
      address: good.address,
      contactName: 'Aisyah',
      contactPhone: '0123456789',
      arrangement: 'MOJA',
    });
    expect(
      validateDeliveryDetails({ ...good, contactPhone: '+60 12-345 6789' })
        .contactPhone,
    ).toBe('+60123456789');
  });

  it.each([
    ['no details at all', undefined],
    ['a too-short address', { ...good, address: 'PJ' }],
    ['no contact name', { ...good, contactName: '  ' }],
    ['a phone with too few digits', { ...good, contactPhone: '12345' }],
    ['no arrangement', { ...good, arrangement: undefined }],
    ['an unknown arrangement', { ...good, arrangement: 'LALAMOVE' }],
  ])('rejects %s', (_label, raw) => {
    expect(() => validateDeliveryDetails(raw)).toThrow(DeliveryDetailsError);
  });
});

describe('deliverySummaryLines', () => {
  it('lists where, who and how, and says the charge is paid separately', () => {
    const lines = deliverySummaryLines(
      validateDeliveryDetails(good),
      '2026-10-02',
      '14:00',
    );
    expect(lines[0]).toBe('Delivery');
    expect(lines).toContain('Date: 2026-10-02');
    expect(lines).toContain('Time: 14:00');
    expect(lines.join('\n')).toContain(good.address);
    expect(lines.join('\n')).toContain('Moja Maison to help arrange');
    expect(lines.join('\n')).toMatch(/charge .*settled before delivery/);
  });

  it('says so when the member books their own courier', () => {
    const lines = deliverySummaryLines(
      validateDeliveryDetails({ ...good, arrangement: 'SELF' }),
      null,
      null,
    );
    expect(lines.join('\n')).toContain('books their own courier');
  });
});

describe('delivery settings', () => {
  it('defaults to on, with no WhatsApp number', () => {
    expect(normalizeDeliverySettings(undefined)).toEqual(
      DEFAULT_DELIVERY_SETTINGS,
    );
    expect(DEFAULT_DELIVERY_SETTINGS).toEqual({
      enabled: true,
      whatsappNumber: '',
      shippingEnabled: true,
      shippingFeeCents: 1000,
      freeShippingOverCents: 10000,
      localDeliveryPostcodes: [],
    });
  });

  it('turns a locally typed Malaysian number into an international one', () => {
    expect(normalizeWhatsappNumber('012-345 6789')).toBe('60123456789');
    expect(normalizeWhatsappNumber('+60 12-345 6789')).toBe('60123456789');
    expect(normalizeWhatsappNumber('0060123456789')).toBe('60123456789');
    expect(normalizeWhatsappNumber('')).toBe('');
  });

  it('rejects a number that cannot work, and bad shapes', () => {
    expect(() => normalizeWhatsappNumber('12345')).toThrow(
      DeliverySettingsError,
    );
    expect(() => normalizeDeliverySettings({ enabled: 'yes' })).toThrow(
      DeliverySettingsError,
    );
    expect(() => normalizeDeliverySettings([])).toThrow(DeliverySettingsError);
  });
});

describe('shipping', () => {
  const noArrangement = {
    address: good.address,
    contactName: good.contactName,
    contactPhone: good.contactPhone,
  };

  it('needs no arrangement: Moja Maison always posts it', () => {
    expect(validateShippingDetails(noArrangement).arrangement).toBe('MOJA');
  });

  it('still needs a full address and a contact', () => {
    expect(() =>
      validateShippingDetails({ ...noArrangement, address: 'PJ' }),
    ).toThrow(DeliveryDetailsError);
    expect(() => validateShippingDetails(undefined)).toThrow(
      DeliveryDetailsError,
    );
  });

  it('describes a parcel without a courier slot', () => {
    const lines = shippingSummaryLines(validateShippingDetails(noArrangement));
    expect(lines[0]).toBe('Shipping');
    expect(lines.join(' ')).toContain(good.address);
    expect(lines.join(' ')).not.toMatch(/Time:/);
  });

  it('keeps a fee between 0 and RM1000, in whole sen', () => {
    expect(
      normalizeDeliverySettings({ shippingFeeCents: 1200 }).shippingFeeCents,
    ).toBe(1200);
    expect(
      normalizeDeliverySettings({ shippingFeeCents: 0 }).shippingFeeCents,
    ).toBe(0);
    for (const bad of [-1, 12.5, '800', 1_000_000]) {
      expect(() =>
        normalizeDeliverySettings({ shippingFeeCents: bad }),
      ).toThrow(DeliverySettingsError);
    }
    expect(() => normalizeDeliverySettings({ shippingEnabled: 'yes' })).toThrow(
      DeliverySettingsError,
    );
  });
});

describe('shippingFeeFor', () => {
  const rule = { shippingFeeCents: 1000, freeShippingOverCents: 10000 };

  it('charges the flat fee up to the free-shipping line', () => {
    expect(shippingFeeFor(rule, 5600)).toBe(1000);
    expect(shippingFeeFor(rule, 10000)).toBe(1000);
  });

  it('waives it once the goods are over the line', () => {
    expect(shippingFeeFor(rule, 10001)).toBe(0);
    expect(shippingFeeFor(rule, 25000)).toBe(0);
  });

  it('never waives it when the line is 0', () => {
    expect(shippingFeeFor({ ...rule, freeShippingOverCents: 0 }, 999999)).toBe(
      1000,
    );
  });
});

describe('free shipping setting', () => {
  it('is validated like the fee', () => {
    expect(
      normalizeDeliverySettings({ freeShippingOverCents: 0 })
        .freeShippingOverCents,
    ).toBe(0);
    expect(normalizeDeliverySettings({}).freeShippingOverCents).toBe(10000);
    for (const bad of [-1, 99.5, '100']) {
      expect(() =>
        normalizeDeliverySettings({ freeShippingOverCents: bad }),
      ).toThrow(DeliverySettingsError);
    }
  });
});

describe('local delivery area', () => {
  const pj = 'No 12, Jalan SS2/24, Petaling Jaya, 47300 Selangor';
  const penang = 'No 8, Jalan Burma, George Town, 10250 Penang';

  it('accepts any address when no area is set', () => {
    expect(addressInLocalArea(penang, [])).toBe(true);
    expect(addressInLocalArea('somewhere', [])).toBe(true);
  });

  it('matches the postcode against the prefixes', () => {
    expect(addressInLocalArea(pj, ['47', '50'])).toBe(true);
    expect(addressInLocalArea(pj, ['47300'])).toBe(true);
    expect(addressInLocalArea(penang, ['47', '50'])).toBe(false);
  });

  it('rejects an address with no postcode once an area is set', () => {
    expect(addressInLocalArea('Jalan SS2, Petaling Jaya', ['47'])).toBe(false);
  });

  it('reads prefixes from a list or a comma separated string', () => {
    expect(normalizePostcodePrefixes('47, 50;50450  47')).toEqual([
      '47',
      '50',
      '50450',
    ]);
    expect(normalizePostcodePrefixes(['47', 50])).toEqual(['47', '50']);
    expect(normalizePostcodePrefixes('')).toEqual([]);
    expect(
      normalizeDeliverySettings({ localDeliveryPostcodes: '47' })
        .localDeliveryPostcodes,
    ).toEqual(['47']);
  });

  it('rejects anything that is not 1 to 5 digits', () => {
    expect(() => normalizePostcodePrefixes('47, abc')).toThrow(
      DeliverySettingsError,
    );
    expect(() => normalizePostcodePrefixes('123456')).toThrow(
      DeliverySettingsError,
    );
    expect(() => normalizePostcodePrefixes({})).toThrow(DeliverySettingsError);
  });
});
