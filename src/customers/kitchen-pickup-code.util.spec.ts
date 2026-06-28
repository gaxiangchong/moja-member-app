import {
  formatKitchenPickupCode,
  isKitchenPickupCode,
  KITCHEN_PICKUP_CODE_MAX,
  KITCHEN_PICKUP_CODE_MIN,
  kitchenPickupQrPayload,
  parseKitchenPickupCodeInput,
} from './kitchen-pickup-code.util';

describe('kitchen pickup code utils', () => {
  it('formats codes in the 6-digit range', () => {
    expect(formatKitchenPickupCode(100000)).toBe('100000');
    expect(formatKitchenPickupCode(104829)).toBe('104829');
  });

  it('validates 6-digit codes', () => {
    expect(isKitchenPickupCode('100042')).toBe(true);
    expect(isKitchenPickupCode('999999')).toBe(true);
    expect(isKitchenPickupCode('12345')).toBe(false);
    expect(isKitchenPickupCode('J6789')).toBe(false);
  });

  it('builds QR payload', () => {
    expect(kitchenPickupQrPayload('104829')).toBe('BENTO:104829');
  });

  it('parses labeled and bare scan input', () => {
    expect(parseKitchenPickupCodeInput('BENTO:104829')).toBe('104829');
    expect(parseKitchenPickupCodeInput('104829')).toBe('104829');
    expect(parseKitchenPickupCodeInput('ORDER:10042')).toBeNull();
  });

  it('defines a 6-digit numeric range', () => {
    expect(KITCHEN_PICKUP_CODE_MIN).toBe(100000);
    expect(KITCHEN_PICKUP_CODE_MAX).toBe(999999);
  });
});
