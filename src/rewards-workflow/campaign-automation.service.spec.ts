import { Prisma } from '@prisma/client';
import { CampaignAutomationService } from './campaign-automation.service';

type Campaign = {
  id: string;
  qualifyingMinSpend: number | null;
  autoCreditThreshold: number | null;
};

function setup(
  campaigns: Campaign[],
  opts: { referrerStatus?: string; earnedSoFar?: number } = {},
) {
  const prisma = {
    voucherCampaign: { findMany: jest.fn().mockResolvedValue(campaigns) },
    customer: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ status: opts.referrerStatus ?? 'ACTIVE' }),
    },
    voucher: {
      count: jest.fn().mockResolvedValue(opts.earnedSoFar ?? 0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const builder = { issueVoucherToCustomer: jest.fn().mockResolvedValue({}) };
  const service = new CampaignAutomationService(
    prisma as never,
    builder as never,
  );
  return { service, prisma, builder };
}

const RM30: Campaign = {
  id: 'c1',
  qualifyingMinSpend: 3000,
  autoCreditThreshold: null,
};

describe('referral purchase voucher', () => {
  it('is not earned when the friend’s first order is under the minimum', async () => {
    const { service, builder } = setup([RM30]);
    expect(
      await service.runReferralPurchaseTrigger('ref', 'friend', 2999),
    ).toBe(0);
    expect(builder.issueVoucherToCustomer).not.toHaveBeenCalled();
  });

  it('is earned at exactly the minimum, and keyed to the friend', async () => {
    const { service, builder } = setup([RM30]);
    expect(
      await service.runReferralPurchaseTrigger('ref', 'friend', 3000),
    ).toBe(1);
    expect(builder.issueVoucherToCustomer).toHaveBeenCalledWith(
      'ref',
      'c1',
      null,
      'auto_referral_purchase',
      undefined,
      'referral:friend',
    );
  });

  it('follows whatever minimum the admin set', async () => {
    const rm50 = { ...RM30, qualifyingMinSpend: 5000 };
    const { service, builder } = setup([rm50]);
    await service.runReferralPurchaseTrigger('ref', 'friend', 4000);
    expect(builder.issueVoucherToCustomer).not.toHaveBeenCalled();
    await service.runReferralPurchaseTrigger('ref', 'friend', 5000);
    expect(builder.issueVoucherToCustomer).toHaveBeenCalledTimes(1);
  });

  it('has no floor when the admin clears the minimum', async () => {
    const none = { ...RM30, qualifyingMinSpend: null };
    const { service, builder } = setup([none]);
    await service.runReferralPurchaseTrigger('ref', 'friend', 100);
    expect(builder.issueVoucherToCustomer).toHaveBeenCalledTimes(1);
  });

  it('stops once the referrer has earned the per-member maximum', async () => {
    const capped = { ...RM30, autoCreditThreshold: 3 };
    const { service, builder } = setup([capped], { earnedSoFar: 3 });
    expect(
      await service.runReferralPurchaseTrigger('ref', 'friend', 9000),
    ).toBe(0);
    expect(builder.issueVoucherToCustomer).not.toHaveBeenCalled();
  });

  it('still issues while the referrer is under the maximum', async () => {
    const capped = { ...RM30, autoCreditThreshold: 3 };
    const { service, builder } = setup([capped], { earnedSoFar: 2 });
    await service.runReferralPurchaseTrigger('ref', 'friend', 9000);
    expect(builder.issueVoucherToCustomer).toHaveBeenCalledTimes(1);
  });

  it('treats an already-issued voucher as done, not as an error', async () => {
    const { service, builder } = setup([RM30]);
    // What the unique index raises when this friend was already counted.
    builder.issueVoucherToCustomer.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    expect(
      await service.runReferralPurchaseTrigger('ref', 'friend', 3000),
    ).toBe(0);
  });

  it('does not reward a suspended or unactivated referrer', async () => {
    const { service, builder } = setup([RM30], { referrerStatus: 'SUSPENDED' });
    expect(
      await service.runReferralPurchaseTrigger('ref', 'friend', 9000),
    ).toBe(0);
    expect(builder.issueVoucherToCustomer).not.toHaveBeenCalled();
  });

  it('does nothing when no referral campaign is running', async () => {
    const { service, prisma } = setup([]);
    expect(
      await service.runReferralPurchaseTrigger('ref', 'friend', 9000),
    ).toBe(0);
    expect(prisma.customer.findUnique).not.toHaveBeenCalled();
  });
});

describe('welcome voucher', () => {
  it('is issued once per campaign and never again', async () => {
    const { service, prisma, builder } = setup([RM30]);
    await service.runNewMemberTrigger('new-member');
    expect(builder.issueVoucherToCustomer).toHaveBeenCalledWith(
      'new-member',
      'c1',
      null,
      'auto_new_member',
      undefined,
      'welcome',
    );

    builder.issueVoucherToCustomer.mockClear();
    prisma.voucher.findFirst.mockResolvedValue({ id: 'already' });
    await service.runNewMemberTrigger('new-member');
    expect(builder.issueVoucherToCustomer).not.toHaveBeenCalled();
  });
});
