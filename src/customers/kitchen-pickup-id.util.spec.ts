import { buildKitchenPickupId } from './kitchen-pickup-id.util';

describe('buildKitchenPickupId', () => {
  it('uses first email letter and last 4 phone digits', () => {
    expect(buildKitchenPickupId('john@example.com', '+60123456789')).toBe('J6789');
  });

  it('uppercases the email letter', () => {
    expect(buildKitchenPickupId('alice@test.com', '+60198765432')).toBe('A5432');
  });

  it('falls back when email is missing', () => {
    expect(buildKitchenPickupId(null, '+6012345678')).toBe('X5678');
  });
});
