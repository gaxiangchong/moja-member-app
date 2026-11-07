import { BadRequestException } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ImportBatchKind, ImportBatchStatus } from '@prisma/client';
import { ImportExportService } from './import-export.service';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';

describe('ImportExportService', () => {
  let tempDir: string;
  let csvPath: string;
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: ImportExportService;

  const auth: AdminAuthState = {
    kind: 'user',
    actorLabel: 'admin@example.com',
    permissions: new Set(),
    isSuper: true,
    adminUserId: 'admin-1',
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'import-export-test-'));
    csvPath = path.join(tempDir, 'wallet.csv');
    await writeFile(csvPath, 'phone_e164,amount_cents,reason\n+6591234567,100,manual\n');

    prisma = {
      importBatch: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'batch-1',
          kind: ImportBatchKind.WALLET_ADJUSTMENT,
          fileName: 'wallet.csv',
          fileStoragePath: csvPath,
          status: ImportBatchStatus.PREVIEW,
        }),
        updateMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    service = new ImportExportService(
      prisma,
      { normalizeToE164: jest.fn((phone: string) => phone) },
      {} as any,
      {} as any,
      {} as any,
      audit,
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('claims the preview batch before applying import rows', async () => {
    prisma.importBatch.updateMany.mockResolvedValue({ count: 1 });
    const applyImportRow = jest
      .spyOn(service as any, 'applyImportRow')
      .mockResolvedValue(undefined);

    await expect(service.commitImport('batch-1', auth)).resolves.toEqual({
      batchId: 'batch-1',
      successRows: 1,
      failedRows: 0,
    });

    expect(prisma.importBatch.updateMany).toHaveBeenCalledWith({
      where: { id: 'batch-1', status: ImportBatchStatus.PREVIEW },
      data: {
        status: ImportBatchStatus.COMMITTED,
        summary: {
          committingAt: expect.any(String),
        },
      },
    });
    expect(applyImportRow).toHaveBeenCalledTimes(1);
    expect(prisma.importBatch.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      applyImportRow.mock.invocationCallOrder[0],
    );
  });

  it('does not apply rows when another request already claimed the batch', async () => {
    prisma.importBatch.updateMany.mockResolvedValue({ count: 0 });
    const applyImportRow = jest
      .spyOn(service as any, 'applyImportRow')
      .mockResolvedValue(undefined);

    await expect(service.commitImport('batch-1', auth)).rejects.toBeInstanceOf(BadRequestException);

    expect(applyImportRow).not.toHaveBeenCalled();
    expect(prisma.importBatch.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});
