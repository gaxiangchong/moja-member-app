import { VoucherIssueMailerService } from './voucher-issue-mailer.service';

const voucher = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  name: 'RM5 off',
  code: 'PROMO-SECRET1',
  status: 'ACTIVE',
  visibleInWallet: true,
  expiresAt: new Date('2026-11-30T00:00:00Z'),
  voucherCampaign: {
    voucherType: 'FIXED_AMOUNT',
    fixedAmountOff: 500,
    minSpend: 3000,
  },
  customer: {
    id: 'm1',
    email: 'Ana@Example.com',
    displayName: 'Ana',
    marketingConsent: true,
    status: 'ACTIVE',
  },
  ...over,
});

function setup(
  row = voucher(),
  opts: { configured?: boolean; sendOk?: boolean } = {},
) {
  const prisma = {
    voucher: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'v1', issueEmailStatus: 'PENDING' }]),
      findUnique: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const email = {
    isConfigured: jest.fn().mockReturnValue(opts.configured ?? true),
    send: jest.fn().mockResolvedValue(opts.sendOk ?? true),
  };
  const mailer = {
    unsubscribeUrl: jest
      .fn()
      .mockReturnValue('https://api.test/mailer/unsubscribe?c=m1&t=x'),
    brandName: jest.fn().mockReturnValue('Moja Maison'),
    marketingFrom: jest.fn().mockReturnValue(undefined),
  };
  const config = { get: jest.fn().mockReturnValue('https://app.test/') };
  const service = new VoucherIssueMailerService(
    prisma as never,
    config as never,
    email as never,
    mailer as never,
  );
  // No real pause between sends in tests.
  jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
    fn();
    return 0;
  }) as never);
  return { service, prisma, email };
}

const finalStatus = (prisma: ReturnType<typeof setup>['prisma']) =>
  (
    (prisma.voucher.update.mock.calls as unknown[][])[0][0] as {
      data: { issueEmailStatus: string };
    }
  ).data.issueEmailStatus;

afterEach(() => jest.restoreAllMocks());

describe('sending queued voucher emails', () => {
  it('emails an opted-in member about the voucher, without its code', async () => {
    const { service, prisma, email } = setup();
    await expect(service.sendPending()).resolves.toBe(1);
    const msg = (email.send.mock.calls as unknown[][])[0][0] as {
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(msg.to).toBe('ana@example.com');
    expect(msg.subject).toContain('RM5 off');
    expect(msg.html).toContain('RM 5.00 off');
    expect(msg.html).toContain('Min. spend RM 30.00');
    expect(msg.html).toContain('https://app.test');
    expect(msg.html).not.toContain('PROMO-SECRET1');
    expect(msg.text).not.toContain('PROMO-SECRET1');
    expect(finalStatus(prisma)).toBe('SENT');
  });

  it('skips a member who unsubscribed after the voucher was issued', async () => {
    const row = voucher();
    row.customer.marketingConsent = false;
    const { service, prisma, email } = setup(row);
    await service.sendPending();
    expect(email.send).not.toHaveBeenCalled();
    expect(finalStatus(prisma)).toBe('SKIPPED');
  });

  it('skips a voucher that was withdrawn before the email went out', async () => {
    const { service, prisma, email } = setup(voucher({ status: 'VOID' }));
    await service.sendPending();
    expect(email.send).not.toHaveBeenCalled();
    expect(finalStatus(prisma)).toBe('SKIPPED');
  });

  it('marks a failed send as FAILED', async () => {
    const { service, prisma } = setup(voucher(), { sendOk: false });
    await expect(service.sendPending()).resolves.toBe(0);
    expect(finalStatus(prisma)).toBe('FAILED');
  });

  it('leaves the queue alone while email is not configured', async () => {
    const { service, prisma, email } = setup(voucher(), { configured: false });
    await service.sendPending();
    expect(prisma.voucher.findMany).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('does not send when another instance claimed the voucher first', async () => {
    const { service, prisma, email } = setup();
    prisma.voucher.updateMany
      .mockResolvedValueOnce({ count: 0 }) // the stale sweep
      .mockResolvedValueOnce({ count: 0 }); // the claim
    await service.sendPending();
    expect(email.send).not.toHaveBeenCalled();
  });
});
