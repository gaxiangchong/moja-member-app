import { CampaignBuilderService } from './campaign-builder.service';

const campaign = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  code: 'PROMO-ABC12',
  codePrefix: 'PROMO',
  name: 'RM5 off',
  template: 'CUSTOM',
  autoCreditTrigger: null,
  isActive: true,
  totalRedemptionCap: null,
  voucherValidDays: 30,
  usageLimitPerUser: 1,
  visibleInWallet: true,
  emailOnIssue: true,
  ...over,
});

const member = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  email: 'ana@example.com',
  marketingConsent: true,
  birthday: null,
  ...over,
});

function setup(c = campaign(), m = member()) {
  const prisma = {
    voucherCampaign: { findUnique: jest.fn().mockResolvedValue(c) },
    customer: { findUnique: jest.fn().mockResolvedValue(m) },
    voucher: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(({ data }: { data: unknown }) => Promise.resolve(data)),
    },
  };
  return { service: new CampaignBuilderService(prisma as never), prisma };
}

const queued = (prisma: ReturnType<typeof setup>['prisma']) =>
  (
    prisma.voucher.create.mock.calls[0][0] as {
      data: { issueEmailStatus: string | null };
    }
  ).data.issueEmailStatus;

describe('queuing the "you have a voucher" email at issue', () => {
  it('queues it for an opted-in member when the campaign emails on issue', async () => {
    const { service, prisma } = setup();
    await service.issueVoucherToCustomer('m1', 'c1');
    expect(queued(prisma)).toBe('PENDING');
  });

  it('does not queue it when the campaign switch is off', async () => {
    const { service, prisma } = setup(campaign({ emailOnIssue: false }));
    await service.issueVoucherToCustomer('m1', 'c1');
    expect(queued(prisma)).toBeNull();
  });

  it('does not queue it for a member who has not agreed to marketing email', async () => {
    const { service, prisma } = setup(
      campaign(),
      member({ marketingConsent: false }),
    );
    await service.issueVoucherToCustomer('m1', 'c1');
    expect(queued(prisma)).toBeNull();
  });

  it('does not queue it for a member with no email address', async () => {
    const { service, prisma } = setup(campaign(), member({ email: '  ' }));
    await service.issueVoucherToCustomer('m1', 'c1');
    expect(queued(prisma)).toBeNull();
  });

  it('never queues it when the caller opts out (counter redemption)', async () => {
    const { service, prisma } = setup();
    await service.issueVoucherToCustomer(
      'm1',
      'c1',
      null,
      null,
      undefined,
      null,
      {
        notifyByEmail: false,
      },
    );
    expect(queued(prisma)).toBeNull();
  });
});
