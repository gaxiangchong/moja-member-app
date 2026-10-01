import {
  DEFAULT_DELIVERY_SETTINGS,
  DeliveryDetailsError,
  DeliverySettingsError,
  deliverySummaryLines,
  normalizeDeliverySettings,
  normalizeWhatsappNumber,
  validateDeliveryDetails,
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
