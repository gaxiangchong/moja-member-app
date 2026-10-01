import { BadRequestException } from '@nestjs/common';
import { CampaignBuilderService } from './campaign-builder.service';

type Voucher = {
  status: string;
  usageCount: number;
  redemptions: { status: string }[];
};

const unused = (): Voucher => ({
  status: 'ACTIVE',
  usageCount: 0,
  redemptions: [],
});

function setup(
  vouchers: Voucher[],
  opts: { remainingAfterDelete?: number } = {},
) {
  const tx = {
    voucher: {
      deleteMany: jest.fn().mockResolvedValue({ count: vouchers.length }),
      count: jest.fn().mockResolvedValue(opts.remainingAfterDelete ?? 0),
    },
    rewardCatalog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    voucherCampaign: { delete: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    voucherCampaign: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'c1', vouchers, rewards: [] }),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { service: new CampaignBuilderService(prisma as never), tx, prisma };
}

async function errorOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return (e as BadRequestException).getResponse() as {
      code: string;
      message: string;
      unusedVouchers?: number;
    };
  }
  throw new Error('expected the call to be refused');
}

describe('deleting a voucher campaign', () => {
  it('deletes a campaign nobody has been issued', async () => {
    const { service, tx } = setup([]);
    await expect(service.deleteCampaign('c1')).resolves.toMatchObject({
      deleted: true,
    });
    expect(tx.voucherCampaign.delete).toHaveBeenCalled();
  });

  it('asks first when unused vouchers are sitting in members’ wallets', async () => {
    const { service, tx } = setup([unused(), unused()]);
    const err = await errorOf(service.deleteCampaign('c1'));
    expect(err).toMatchObject({
      code: 'CAMPAIGN_HAS_UNUSED_VOUCHERS',
      unusedVouchers: 2,
    });
    expect(tx.voucher.deleteMany).not.toHaveBeenCalled();
    expect(tx.voucherCampaign.delete).not.toHaveBeenCalled();
  });

  it('removes the unused vouchers along with the campaign once confirmed', async () => {
    const { service, tx } = setup([unused()]);
    await expect(service.deleteCampaign('c1', true)).resolves.toMatchObject({
      deleted: true,
      removedVouchers: 1,
    });
    expect(tx.voucherCampaign.delete).toHaveBeenCalled();
  });

  it('treats expired and withdrawn vouchers as unused', async () => {
    const { service } = setup([
      { status: 'EXPIRED', usageCount: 0, redemptions: [] },
      { status: 'VOID', usageCount: 0, redemptions: [] },
    ]);
    await expect(service.deleteCampaign('c1', true)).resolves.toMatchObject({
      deleted: true,
    });
  });

  it.each([
    ['a used voucher', { status: 'USED', usageCount: 1, redemptions: [] }],
    [
      'a voucher mid-checkout',
      { status: 'LOCKED', usageCount: 0, redemptions: [] },
    ],
    [
      'a confirmed redemption',
      {
        status: 'ACTIVE',
        usageCount: 0,
        redemptions: [{ status: 'CONFIRMED' }],
      },
    ],
    [
      'a voucher with recorded use',
      { status: 'ACTIVE', usageCount: 1, redemptions: [] },
    ],
  ])('never deletes %s, even when forced', async (_name, voucher) => {
    const { service, tx } = setup([unused(), voucher]);
    const err = await errorOf(service.deleteCampaign('c1', true));
    expect(err.code).toBe('CAMPAIGN_HAS_USED_VOUCHERS');
    expect(tx.voucher.deleteMany).not.toHaveBeenCalled();
    expect(tx.voucherCampaign.delete).not.toHaveBeenCalled();
  });

  it('ignores released redemptions, which never cost a member anything', async () => {
    const { service } = setup([
      {
        status: 'ACTIVE',
        usageCount: 0,
        redemptions: [{ status: 'RELEASED' }],
      },
    ]);
    await expect(service.deleteCampaign('c1', true)).resolves.toMatchObject({
      deleted: true,
    });
  });

  it('rolls back rather than delete a voucher that was used mid-delete', async () => {
    // The check passed, but by the time the delete ran one voucher had been
    // spent, so it survived the "unused only" delete.
    const { service, tx } = setup([unused()], { remainingAfterDelete: 1 });
    const err = await errorOf(service.deleteCampaign('c1', true));
    expect(err.code).toBe('CAMPAIGN_HAS_USED_VOUCHERS');
    expect(tx.voucherCampaign.delete).not.toHaveBeenCalled();
  });
});
