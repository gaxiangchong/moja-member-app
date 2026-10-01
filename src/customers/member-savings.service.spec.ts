import { MemberSavingsService } from './member-savings.service';

function setup(opts: {
  online?: { saved: bigint; orders: bigint }[];
  inStore?: number | null;
  joined?: Date | null;
}) {
  const prisma = {
    $queryRaw: jest
      .fn()
      .mockResolvedValue(opts.online ?? [{ saved: 0n, orders: 0n }]),
    posReceipt: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { discountCents: opts.inStore ?? null } }),
    },
    customer: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.joined === null
            ? null
            : { createdAt: opts.joined ?? new Date() },
        ),
    },
  };
  return { service: new MemberSavingsService(prisma as never), prisma };
}

describe('member savings', () => {
  it('adds app-order discounts and in-store discounts together', async () => {
    const { service } = setup({
      online: [{ saved: 12_500n, orders: 4n }],
      inStore: 3_000,
      joined: new Date('2026-03-01T00:00:00Z'),
    });
    expect(await service.getSavings('m')).toEqual({
      totalSavedCents: 15_500,
      onlineSavedCents: 12_500,
      inStoreSavedCents: 3_000,
      ordersCounted: 4,
      memberSince: '2026-03-01T00:00:00.000Z',
    });
  });

  it('is zero for a member who has never been discounted', async () => {
    const { service } = setup({});
    expect(await service.getSavings('m')).toMatchObject({
      totalSavedCents: 0,
      onlineSavedCents: 0,
      inStoreSavedCents: 0,
      ordersCounted: 0,
    });
  });

  it('leaves out the till’s settlement of an online order, which would count its discount twice', async () => {
    const { service, prisma } = setup({ inStore: 500 });
    await service.getSavings('m');
    const call = prisma.posReceipt.aggregate.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(call[0].where).toEqual({
      customerId: 'm',
      originOnlineOrderId: null,
      discountCents: { gt: 0 },
    });
  });

  it('copes with a member that no longer exists', async () => {
    const { service } = setup({ joined: null });
    expect((await service.getSavings('m')).memberSince).toBeNull();
  });
});
