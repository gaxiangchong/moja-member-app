import {
  kindWhere,
  orderKind,
  searchWhere,
  shopDayRange,
  TAB_STATUSES,
} from './commerce-orders.util';

describe('shopDayRange', () => {
  it('uses Kuala Lumpur days, not UTC days', () => {
    const { gte, lt } = shopDayRange('2026-11-07', '2026-11-07');
    expect(gte?.toISOString()).toBe('2026-11-06T16:00:00.000Z');
    expect(lt?.toISOString()).toBe('2026-11-07T16:00:00.000Z');
    // 7am in Kuala Lumpur on the 7th is still the 6th in UTC.
    const sevenAm = new Date('2026-11-06T23:00:00.000Z');
    expect(sevenAm >= gte! && sevenAm < lt!).toBe(true);
  });

  it('leaves out the side that is not given', () => {
    expect(shopDayRange('2026-11-07')).toEqual({
      gte: new Date('2026-11-06T16:00:00.000Z'),
    });
    expect(shopDayRange(undefined, undefined)).toEqual({});
  });
});

describe('order tabs', () => {
  it('puts every status in exactly one tab', () => {
    const all = Object.values(TAB_STATUSES).flat();
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([
      'cancelled',
      'completed',
      'pending_payment',
      'placed',
      'preparing',
      'ready',
      'refunded',
    ]);
  });
});

describe('order kinds', () => {
  it('tells parcels from local delivery, including old orders with no method', () => {
    expect(
      orderKind({ fulfilmentType: 'IN_STORE', deliveryMethod: null }),
    ).toBe('in_store');
    expect(orderKind({ fulfilmentType: 'PICKUP', deliveryMethod: null })).toBe(
      'pickup',
    );
    expect(
      orderKind({ fulfilmentType: 'DELIVERY', deliveryMethod: 'SHIPPING' }),
    ).toBe('parcel');
    expect(
      orderKind({ fulfilmentType: 'DELIVERY', deliveryMethod: 'LOCAL' }),
    ).toBe('delivery');
    expect(
      orderKind({ fulfilmentType: 'DELIVERY', deliveryMethod: null }),
    ).toBe('delivery');
  });

  it('filters local delivery so null methods are included', () => {
    expect(kindWhere('delivery')).toEqual({
      fulfilmentType: 'DELIVERY',
      OR: [{ deliveryMethod: null }, { deliveryMethod: { not: 'SHIPPING' } }],
    });
  });
});

describe('searchWhere', () => {
  it('ignores blank searches', () => {
    expect(searchWhere('   ')).toBeNull();
  });

  it('matches an order number, with or without the #', () => {
    expect(JSON.stringify(searchWhere('#1042'))).toContain(
      '"orderNumber":1042',
    );
    expect(JSON.stringify(searchWhere('1042'))).toContain('"orderNumber":1042');
  });

  it('finds a local phone number stored as +60', () => {
    expect(JSON.stringify(searchWhere('012-345 6789'))).toContain(
      '"contains":"123456789"',
    );
  });

  it('does not treat a cake name as an order number', () => {
    expect(JSON.stringify(searchWhere('cheesecake'))).not.toContain(
      'orderNumber',
    );
  });

  it('does not overflow the order number column', () => {
    expect(JSON.stringify(searchWhere('60123456789'))).not.toContain(
      'orderNumber',
    );
  });
});
