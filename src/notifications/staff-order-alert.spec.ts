import { OrderNotificationService } from './order-notification.service';
import { buildStaffOrderAlert } from './staff-order-alert';

describe('buildStaffOrderAlert', () => {
  it('lists the items, pickup notes, total and customer', () => {
    const alert = buildStaffOrderAlert({
      orderNumber: 1042,
      fulfilmentType: 'IN_STORE',
      fulfillmentSummary: [
        'In store · prepare now',
        'Collect today from 3:40 PM',
      ],
      customerName: 'Aisyah <b>Rahman</b>',
      customerPhone: '+60123456789',
      totalCents: 14900,
      lines: [
        { name: 'Strawberry Short Cake', variantLabel: '6 inch', qty: 1 },
        { name: 'Birthday set', variantLabel: null, qty: 1 },
      ],
      queueUrl: 'https://ops.example.com',
    });
    expect(alert.subject).toBe('New order #1042 · In store today · RM 149.00');
    expect(alert.text).toContain('1 × Strawberry Short Cake (6 inch)');
    expect(alert.text).toContain('Collect today from 3:40 PM');
    expect(alert.text).toContain(
      'Open the order queue: https://ops.example.com',
    );
    // Customer text is escaped in the HTML.
    expect(alert.html).toContain('Aisyah &lt;b&gt;Rahman&lt;/b&gt;');
  });
});

describe('OrderNotificationService staff alert', () => {
  function makeService(env: Record<string, string>, emailConfigured = true) {
    const send = jest.fn().mockResolvedValue(true);
    const svc = new OrderNotificationService(
      {
        customerOrder: {
          findUnique: jest.fn().mockResolvedValue({
            orderNumber: 1042,
            fulfilmentType: 'PICKUP',
            fulfillmentSummary: [
              'Self pickup',
              'Date: 2026-11-04',
              'Time: 16:00',
            ],
            totalCents: 20800,
            customer: { displayName: 'Mei Ling', phoneE164: '+60111234432' },
            lines: [
              {
                name: 'Caramel Espresso Gateau',
                variantLabel: '8 inch',
                qty: 1,
              },
            ],
          }),
        },
      } as never,
      {
        isConfigured: () => emailConfigured,
        getSubjectPrefix: () => '[Moja]',
        send,
      } as never,
      {} as never,
      { get: (k: string) => env[k] } as never,
    );
    return { svc, send };
  }

  it('emails the shop inbox, falling back to the bento inbox', async () => {
    const { svc, send } = makeService({
      BENTO_ADMIN_NOTIFY_EMAIL: 'kitchen@moja.test',
    });
    expect(svc.staffAlertStatus()).toEqual({
      on: true,
      recipient: 'kitchen@moja.test',
      reason: null,
    });
    await expect(svc.notifyStaffNewOrder('o1')).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'kitchen@moja.test',
        subject: '[Moja] New order #1042 · Pickup · RM 208.00',
      }),
    );
  });

  it('can be turned off, and reports why', async () => {
    const { svc, send } = makeService({ SHOP_ORDER_NOTIFY_EMAIL: 'off' });
    expect(svc.staffAlertStatus().on).toBe(false);
    await expect(svc.notifyStaffNewOrder('o1')).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('is off when email sending is not set up', () => {
    const { svc } = makeService(
      { SHOP_ORDER_NOTIFY_EMAIL: 'shop@moja.test' },
      false,
    );
    expect(svc.staffAlertStatus()).toEqual({
      on: false,
      recipient: 'shop@moja.test',
      reason: 'Email sending is not set up on the server.',
    });
  });
});
