import { BentoOrdersReportService } from './bento-orders-report.service';
import type { ReportingSettingsService } from '../admin/reporting-settings.service';
import type { PrismaService } from '../prisma/prisma.service';

/** Minimal Prisma stub: both order queries resolve to empty result sets. */
function makePrisma() {
  return {
    bentoDeliveryDay: { findMany: jest.fn().mockResolvedValue([]) },
    bentoSubscription: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>, cutoffWhere: object) {
  const reporting = {
    createdAtCutoffWhere: () => cutoffWhere,
  } as unknown as ReportingSettingsService;
  return new BentoOrdersReportService(
    prisma as unknown as PrismaService,
    reporting,
  );
}

describe('BentoOrdersReportService — sales-start cutoff is applied to queries', () => {
  const CUTOFF = new Date('2026-06-22T00:00:00.000Z');

  it('filters orders by subscription.createdAt when a cutoff is set', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, { createdAt: { gte: CUTOFF } });

    await svc.getCounts('2026-06-22', '2026-06-28');

    // Awaiting-schedule list: filtered on the subscription itself.
    const awaitWhere = prisma.bentoSubscription.findMany.mock.calls[0][0].where;
    expect(awaitWhere.createdAt).toEqual({ gte: CUTOFF });

    // Kitchen pickups: filtered via the subscription relation.
    const deliveryWhere = prisma.bentoDeliveryDay.findMany.mock.calls[0][0].where;
    expect(deliveryWhere.subscription.createdAt).toEqual({ gte: CUTOFF });
  });

  it('adds no createdAt filter when no cutoff is set', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, {});

    await svc.getCounts('2026-06-22', '2026-06-28');

    const awaitWhere = prisma.bentoSubscription.findMany.mock.calls[0][0].where;
    expect(awaitWhere.createdAt).toBeUndefined();

    const deliveryWhere = prisma.bentoDeliveryDay.findMany.mock.calls[0][0].where;
    expect(deliveryWhere.subscription.createdAt).toBeUndefined();
  });
});
