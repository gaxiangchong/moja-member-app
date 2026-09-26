import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ReportingSettingsService } from '../admin/reporting-settings.service';
import { SalesplayPullService } from './salesplay-pull.service';
import { SalesplayService } from './salesplay.service';
import { SalesplayWebhookService } from './salesplay-webhook.service';

function configWith(values: Record<string, string>): ConfigService {
  return {
    get: (k: string) => values[k],
    getOrThrow: (k: string) => {
      if (values[k] == null) throw new Error(`missing ${k}`);
      return values[k];
    },
  } as unknown as ConfigService;
}

function makeService(
  env: Record<string, string>,
  lastPulledAt: Date | null,
): { service: SalesplayPullService; findUnique: jest.Mock } {
  const findUnique = jest
    .fn()
    .mockResolvedValue(
      lastPulledAt ? { lastPulledAt, lastWebhookAt: null } : null,
    );
  const prisma = {
    salesplaySyncState: { findUnique },
  } as unknown as PrismaService;
  const salesplay = { isConfigured: () => true } as unknown as SalesplayService;
  const webhook = {} as unknown as SalesplayWebhookService;
  const reporting = {
    getSalesStartDate: () => null,
  } as unknown as ReportingSettingsService;

  return {
    service: new SalesplayPullService(
      configWith(env),
      prisma,
      salesplay,
      webhook,
      reporting,
    ),
    findUnique,
  };
}

const ON = { SALESPLAY_RECONCILE_ENABLED: 'true' };

describe('reconcile interval', () => {
  it('defaults to hourly', () => {
    const { service } = makeService(ON, null);
    expect(service.reconcileIntervalHours()).toBe(1);
  });

  it('honours an explicit interval, including fractions', () => {
    expect(
      makeService(
        { ...ON, SALESPLAY_RECONCILE_INTERVAL_HOURS: '6' },
        null,
      ).service.reconcileIntervalHours(),
    ).toBe(6);
    expect(
      makeService(
        { ...ON, SALESPLAY_RECONCILE_INTERVAL_HOURS: '0.5' },
        null,
      ).service.reconcileIntervalHours(),
    ).toBe(0.5);
  });

  it('falls back to hourly for nonsense or non-positive values', () => {
    for (const v of ['abc', '0', '-3', '']) {
      expect(
        makeService(
          { ...ON, SALESPLAY_RECONCILE_INTERVAL_HOURS: v },
          null,
        ).service.reconcileIntervalHours(),
      ).toBe(1);
    }
  });
});

describe('reconcileTick', () => {
  const realEnv = process.env.NODE_ENV;
  beforeAll(() => {
    // The tick short-circuits under NODE_ENV=test so jest runs never call out.
    process.env.NODE_ENV = 'development';
  });
  afterAll(() => {
    process.env.NODE_ENV = realEnv;
  });

  it('does nothing while the scheduled reconcile is switched off', async () => {
    const { service, findUnique } = makeService({}, null);
    const spy = jest.spyOn(service, 'reconcile').mockResolvedValue({} as never);
    await service.reconcileTick();
    expect(findUnique).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('pulls immediately when nothing has ever been pulled', async () => {
    const { service } = makeService(ON, null);
    const spy = jest.spyOn(service, 'reconcile').mockResolvedValue({} as never);
    await service.reconcileTick();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('skips a tick when the last pull is younger than the interval', async () => {
    // 20 minutes ago, hourly interval -> not due.
    const { service } = makeService(ON, new Date(Date.now() - 20 * 60_000));
    const spy = jest.spyOn(service, 'reconcile').mockResolvedValue({} as never);
    await service.reconcileTick();
    expect(spy).not.toHaveBeenCalled();
  });

  it('pulls once the interval has elapsed', async () => {
    // 61 minutes ago, hourly interval -> due. This is the case the 5-minute
    // tick exists for: an hourly poll would not have fired until ~2h.
    const { service } = makeService(ON, new Date(Date.now() - 61 * 60_000));
    const spy = jest.spyOn(service, 'reconcile').mockResolvedValue({} as never);
    await service.reconcileTick();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('respects a longer configured interval', async () => {
    const env = { ...ON, SALESPLAY_RECONCILE_INTERVAL_HOURS: '24' };
    const { service } = makeService(env, new Date(Date.now() - 2 * 3600_000));
    const spy = jest.spyOn(service, 'reconcile').mockResolvedValue({} as never);
    await service.reconcileTick();
    expect(spy).not.toHaveBeenCalled();
  });

  it('swallows pull errors so one bad tick cannot kill the schedule', async () => {
    const { service } = makeService(ON, null);
    jest
      .spyOn(service, 'reconcile')
      .mockRejectedValue(new Error('SalesPlay 500'));
    await expect(service.reconcileTick()).resolves.toBeUndefined();
  });
});
