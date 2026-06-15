import { ForbiddenException } from '@nestjs/common';
import { ExportJobKind } from '@prisma/client';
import { P } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { ImportExportService } from './import-export.service';

describe('ImportExportService', () => {
  const authWith = (...permissions: string[]): AdminAuthState => ({
    kind: 'user',
    actorLabel: 'admin@example.com',
    permissions: new Set(permissions),
    isSuper: false,
  });

  const createService = (job: Record<string, unknown>) => {
    const prisma = {
      exportJob: {
        findUnique: jest.fn().mockResolvedValue(job),
      },
    };
    const service = new ImportExportService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { prisma, service };
  };

  it('rejects downloads when the admin lacks the export kind permission', async () => {
    const { service } = createService({
      id: 'job-1',
      kind: ExportJobKind.WALLET_LEDGER,
      status: 'COMPLETED',
      storagePath: '/tmp/wallet.csv',
      fileName: 'wallet.csv',
    });

    await expect(
      service.getExportJobFile('job-1', authWith(P.EXPORT_RUN)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows downloads when the admin has the export kind permission', async () => {
    const { service } = createService({
      id: 'job-1',
      kind: ExportJobKind.WALLET_LEDGER,
      status: 'COMPLETED',
      storagePath: '/tmp/wallet.csv',
      fileName: 'wallet.csv',
    });

    await expect(
      service.getExportJobFile('job-1', authWith(P.EXPORT_RUN, P.WALLET_READ)),
    ).resolves.toEqual({ path: '/tmp/wallet.csv', fileName: 'wallet.csv' });
  });
});
