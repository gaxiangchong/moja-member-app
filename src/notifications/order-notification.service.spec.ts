import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { OrderNotificationService } from './order-notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappMessagingService } from './whatsapp-messaging.service';

function configFrom(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    status: 'ready',
    orderNumber: 42,
    fulfilmentType: 'PICKUP',
    scheduledDate: null,
    scheduledSlot: null,
    cancelReason: null,
    customer: {
      displayName: 'Ada',
      phoneE164: '+60123456789',
      email: 'ada@example.com',
    },
    ...overrides,
  };
}

function service(opts: {
  env?: Record<string, string>;
  order?: Record<string, unknown> | null;
  whatsappConfigured?: boolean;
  emailConfigured?: boolean;
  sendTemplate?: jest.Mock;
  sendEmail?: jest.Mock;
}) {
  const prisma = {
    customerOrder: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.order === undefined ? orderRow() : opts.order),
    },
  } as unknown as PrismaService;
  const email = {
    isConfigured: jest.fn().mockReturnValue(opts.emailConfigured ?? true),
    getSubjectPrefix: jest.fn().mockReturnValue('Moja Maison'),
    send: opts.sendEmail ?? jest.fn().mockResolvedValue(true),
  } as unknown as EmailService;
  const whatsapp = {
    isConfigured: jest.fn().mockReturnValue(opts.whatsappConfigured ?? true),
    sendUtilityTemplate:
      opts.sendTemplate ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as WhatsappMessagingService;
  const svc = new OrderNotificationService(
    prisma,
    email,
    whatsapp,
    configFrom(opts.env ?? {}),
  );
  return { svc, email, whatsapp };
}

describe('OrderNotificationService', () => {
  it('sends the ready template on WhatsApp and does not also email', async () => {
    const sendTemplate = jest.fn().mockResolvedValue(undefined);
    const sendEmail = jest.fn();
    const { svc } = service({
      env: { WHATSAPP_ORDER_READY_TEMPLATE_NAME: 'order_ready' },
      sendTemplate,
      sendEmail,
    });

    await expect(svc.notify('order-1', 'ready')).resolves.toBe('whatsapp');
    expect(sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'order_ready',
        toE164: '+60123456789',
        metaTemplateName: 'order_ready',
        bodyParameters: ['Ada', '42', expect.stringContaining('counter')],
      }),
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('emails when the ready template is not approved yet', async () => {
    const sendTemplate = jest.fn();
    const sendEmail = jest.fn().mockResolvedValue(true);
    const { svc } = service({ sendTemplate, sendEmail, env: {} });

    await expect(svc.notify('order-1', 'ready')).resolves.toBe('email');
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@example.com',
        subject: 'Moja Maison Order #42 is ready for pickup',
      }),
    );
  });

  it('falls back to email when WhatsApp rejects the send', async () => {
    const sendEmail = jest.fn().mockResolvedValue(true);
    const { svc } = service({
      env: { WHATSAPP_ORDER_READY_TEMPLATE_NAME: 'order_ready' },
      sendTemplate: jest
        .fn()
        .mockRejectedValue(new Error('WhatsApp send failed: 400')),
      sendEmail,
    });

    await expect(svc.notify('order-1', 'ready')).resolves.toBe('email');
    expect(sendEmail).toHaveBeenCalled();
  });

  it('does not email a placed confirmation when WhatsApp is not set up', async () => {
    const sendEmail = jest.fn();
    const { svc } = service({
      order: orderRow({ status: 'placed' }),
      sendEmail,
      whatsappConfigured: false,
    });

    await expect(svc.notify('order-1', 'placed')).resolves.toBe('none');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('skips a notice when the order has already moved on', async () => {
    const sendEmail = jest.fn();
    const { svc } = service({
      order: orderRow({ status: 'completed' }),
      sendEmail,
    });

    await expect(svc.notify('order-1', 'ready')).resolves.toBe('none');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not notify an abandoned unpaid checkout', async () => {
    const sendEmail = jest.fn();
    const { svc } = service({
      order: orderRow({
        status: 'cancelled',
        cancelReason: 'Payment not completed',
      }),
      sendEmail,
    });

    await expect(svc.notify('order-1', 'cancelled')).resolves.toBe('none');
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
