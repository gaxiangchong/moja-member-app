import { BadRequestException } from '@nestjs/common';
import { ImportBatchKind, ImportBatchStatus } from '@prisma/client';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ImportExportService } from './import-export.service';

const auth = {
  kind: 'admin_user',
  actorLabel: 'admin:test',
  permissions: new Set<string>(),
  isSuper: true,
};

function createService(updateManyCount: number) {
  const prisma = {
    importBatch: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: updateManyCount }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const phones = {
    normalizeToE164: jest.fn().mockReturnValue('+6591234567'),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ImportExportService(
    prisma as never,
    phones as never,
    {} as never,
    {} as never,
    {} as never,
    audit as never,
  );

  return { service, prisma, phones, audit };
}

describe('ImportExportService.commitImport', () => {
  it('does not apply rows when another request already claimed the batch', async () => {
    const { service, prisma } = createService(0);
    prisma.importBatch.findUnique.mockResolvedValue({
      id: 'batch-1',
      kind: ImportBatchKind.WALLET_ADJUSTMENT,
      fileName: 'wallet.csv',
      fileStoragePath: '/tmp/wallet.csv',
      status: ImportBatchStatus.PREVIEW,
      totalRows: 1,
    });
    const applyImportRow = jest.fn();
    (service as unknown as { applyImportRow: jest.Mock }).applyImportRow =
      applyImportRow;

    await expect(
      service.commitImport('batch-1', auth as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.importBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'batch-1', status: ImportBatchStatus.PREVIEW },
      }),
    );
    expect(applyImportRow).not.toHaveBeenCalled();
    expect(prisma.importBatch.update).not.toHaveBeenCalled();
  });

  it('claims preview status before applying import rows', async () => {
    const filePath = path.join(os.tmpdir(), `wallet-import-${Date.now()}.csv`);
    await fs.writeFile(
      filePath,
      'phone_e164,amount_cents,reason\n+6591234567,1000,bonus\n',
      'utf8',
    );

    const { service, prisma, phones, audit } = createService(1);
    prisma.importBatch.findUnique.mockResolvedValue({
      id: 'batch-2',
      kind: ImportBatchKind.WALLET_ADJUSTMENT,
      fileName: 'wallet.csv',
      fileStoragePath: filePath,
      status: ImportBatchStatus.PREVIEW,
      totalRows: 1,
    });
    const applyImportRow = jest.fn().mockResolvedValue(undefined);
    (service as unknown as { applyImportRow: jest.Mock }).applyImportRow =
      applyImportRow;

    await expect(
      service.commitImport('batch-2', auth as never),
    ).resolves.toEqual({
      batchId: 'batch-2',
      successRows: 1,
      failedRows: 0,
    });

    expect(
      prisma.importBatch.updateMany.mock.invocationCallOrder[0]!,
    ).toBeLessThan(applyImportRow.mock.invocationCallOrder[0]!);
    expect(applyImportRow).toHaveBeenCalledWith(
      ImportBatchKind.WALLET_ADJUSTMENT,
      expect.objectContaining({ amount_cents: '1000' }),
      '+6591234567',
    );
    expect(phones.normalizeToE164).toHaveBeenCalledWith('+6591234567');
    expect(prisma.importBatch.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'batch-2' },
        data: expect.objectContaining({
          status: ImportBatchStatus.COMMITTED,
          successRows: 1,
          failedRows: 0,
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalled();

    await fs.unlink(filePath);
  });
});
