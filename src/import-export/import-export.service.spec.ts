import { ForbiddenException } from '@nestjs/common';
import { ExportJobKind } from '@prisma/client';
import { P } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { ImportExportService } from './import-export.service';

describe('ImportExportService', () => {
  const completedCustomerExport = {
    id: 'export-1',
    kind: ExportJobKind.CUSTOMERS,
    status: 'COMPLETED',
    storagePath: '/tmp/customers.csv',
    fileName: 'customers.csv',
  };

  function buildService(prisma: unknown) {
    return new ImportExportService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  function authWith(permissions: string[]): AdminAuthState {
    return {
      kind: 'user',
      actorLabel: 'admin@example.com',
      permissions: new Set(permissions),
      isSuper: false,
    };
  }

  it('rejects downloads when the admin lacks the export kind permission', async () => {
    const prisma = {
      exportJob: {
        findUnique: jest.fn().mockResolvedValue(completedCustomerExport),
      },
    };
    const service = buildService(prisma);

    await expect(
      service.getExportJobFile('export-1', authWith([P.EXPORT_RUN])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows downloads when the admin has the export kind permission', async () => {
    const prisma = {
      exportJob: {
        findUnique: jest.fn().mockResolvedValue(completedCustomerExport),
      },
    };
    const service = buildService(prisma);

    await expect(
      service.getExportJobFile('export-1', authWith([P.CUSTOMER_EXPORT])),
    ).resolves.toEqual({
      path: '/tmp/customers.csv',
      fileName: 'customers.csv',
    });
  });
});
