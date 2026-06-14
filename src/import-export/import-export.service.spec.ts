import { ForbiddenException } from '@nestjs/common';
import { ImportBatchKind, ImportBatchStatus } from '@prisma/client';
import { P } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { ImportExportService } from './import-export.service';

describe('ImportExportService', () => {
  it('requires the underlying mutation permission before committing an import batch', async () => {
    const prisma = {
      importBatch: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'batch-1',
          kind: ImportBatchKind.VOUCHER_ASSIGNMENT,
          status: ImportBatchStatus.PREVIEW,
          fileStoragePath: '/tmp/does-not-need-to-exist.csv',
          fileName: 'vouchers.csv',
        }),
      },
    };
    const service = new ImportExportService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const financeAuth: AdminAuthState = {
      kind: 'user',
      actorLabel: 'finance@example.com',
      permissions: new Set([P.IMPORT_COMMIT, P.WALLET_ADJUST]),
      isSuper: false,
    };

    await expect(
      service.commitImport('batch-1', financeAuth),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
