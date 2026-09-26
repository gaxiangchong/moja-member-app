import { buildOrderNotice, sanitizeWhatsappParam } from './order-notice';

describe('sanitizeWhatsappParam', () => {
  it('collapses newlines and falls back when empty', () => {
    expect(sanitizeWhatsappParam('  hello\n\nthere  ', 'fallback')).toBe(
      'hello there',
    );
    expect(sanitizeWhatsappParam('   ', 'fallback')).toBe('fallback');
  });
});

describe('buildOrderNotice', () => {
  const pickup = new Date('2026-09-26T00:00:00.000Z');

  it('tells a pickup order it is ready, with the slot in the third variable', () => {
    const notice = buildOrderNotice({
      kind: 'ready',
      displayName: 'Ada',
      orderNumber: 42,
      fulfilmentType: 'PICKUP',
      scheduledDate: pickup,
      scheduledSlot: '14:00',
      cancelReason: null,
      ordersUrl: 'https://app.example/?tab=orders',
    });

    expect(notice.whatsappBodyParameters[0]).toBe('Ada');
    expect(notice.whatsappBodyParameters[1]).toBe('42');
    expect(notice.whatsappBodyParameters[2]).toContain('2:00 PM');
    expect(notice.whatsappBodyParameters[2]).toContain('26');
    expect(notice.whatsappBodyParameters[2]).toContain('counter');
    expect(notice.emailSubject).toBe('Order #42 is ready for pickup');
    expect(notice.emailText).toContain('https://app.example/?tab=orders');
    for (const param of notice.whatsappBodyParameters) {
      expect(param).not.toMatch(/[\r\n]/);
    }
  });

  it('uses a delivery sentence instead of the counter', () => {
    const notice = buildOrderNotice({
      kind: 'ready',
      displayName: null,
      orderNumber: 7,
      fulfilmentType: 'DELIVERY',
      scheduledDate: null,
      scheduledSlot: null,
      cancelReason: null,
      ordersUrl: null,
    });
    expect(notice.whatsappBodyParameters[0]).toBe('there');
    expect(notice.whatsappBodyParameters[2]).toContain('delivery');
    expect(notice.whatsappBodyParameters[2]).not.toContain('counter');
    expect(notice.emailSubject).toBe('Order #7 is ready');
  });

  it('puts the cancellation reason in the third variable', () => {
    const notice = buildOrderNotice({
      kind: 'cancelled',
      displayName: 'Ada',
      orderNumber: 3,
      fulfilmentType: 'PICKUP',
      scheduledDate: null,
      scheduledSlot: null,
      cancelReason: 'Wrong date\nplease',
      ordersUrl: null,
    });
    expect(notice.whatsappBodyParameters[2]).toBe('Wrong date please');
    expect(notice.emailSubject).toBe('Order #3 was cancelled');
  });
});
