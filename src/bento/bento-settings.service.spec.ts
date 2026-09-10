import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { BentoSettingsService } from './bento-settings.service';

describe('BentoSettingsService.setSettings operationsEndDate', () => {
  let prisma: { appSetting: { upsert: jest.Mock; findUnique: jest.Mock } };
  let svc: BentoSettingsService;

  beforeEach(() => {
    prisma = {
      appSetting: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    svc = new BentoSettingsService(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  it('keeps a stored shutdown date when a later save omits operationsEndDate', async () => {
    await svc.setSettings({
      dailyCapacityPacks: 50,
      operationsEndDate: '2026-09-15',
    });
    const saved = await svc.setSettings({
      dailyCapacityPacks: 40,
      closedDates: ['2026-09-16'],
    });

    expect(saved.operationsEndDate).toBe('2026-09-15');
    expect(saved.dailyCapacityPacks).toBe(40);
    expect(saved.closedDates).toEqual(['2026-09-16']);
    const persisted = prisma.appSetting.upsert.mock.calls.at(-1)[0]
      .update.value as { operationsEndDate: string | null };
    expect(persisted.operationsEndDate).toBe('2026-09-15');
  });

  it('clears the shutdown date when the caller sends explicit null', async () => {
    await svc.setSettings({
      dailyCapacityPacks: 50,
      operationsEndDate: '2026-09-15',
    });
    const saved = await svc.setSettings({
      dailyCapacityPacks: 50,
      operationsEndDate: null,
    });
    expect(saved.operationsEndDate).toBeNull();
  });
});
