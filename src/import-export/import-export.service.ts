import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CustomerStatus,
  ExportJobKind,
  ImportBatchKind,
  ImportBatchStatus,
  Prisma,
  WalletTxnType,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { stringify } from 'csv-stringify/sync';
import { auditActorBase } from '../admin-auth/audit-context.util';
import { P, hasPermission } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PhoneNormalizerService } from '../customers/phone-normalizer.service';
import { WalletService } from '../wallet/wallet.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { SegmentationService } from '../segmentation/segmentation.service';
import type { ExportRequestDto } from './dto/export-request.dto';
import type { SegmentFiltersDto } from '../segmentation/dto/segment-filters.dto';

function ensureDir(p: string) {
  return fs.mkdir(p, { recursive: true });
}

function assertExportKindAllowed(
  auth: AdminAuthState,
  kind: ExportJobKind,
): void {
  const required: Record<ExportJobKind, string[]> = {
    CUSTOMERS: [P.CUSTOMER_EXPORT],
    WALLET_LEDGER: [P.WALLET_READ],
    POINTS_LEDGER: [P.LOYALTY_READ],
    VOUCHERS_ISSUED: [P.VOUCHER_READ],
    VOUCHERS_REDEEMED: [P.VOUCHER_READ],
    AUDIT_LOGS: [P.AUDIT_EXPORT],
    IMPORT_BATCHES: [P.IMPORT_PREVIEW],
    SEGMENT_AUDIENCE: [P.SEGMENT_EXPORT],
  };
  for (const p of required[kind]) {
    if (!hasPermission(auth.permissions, p)) {
      throw new ForbiddenException({
        code: 'EXPORT_KIND_FORBIDDEN',
        message: `Export ${kind} requires permission: ${p}`,
      });
    }
  }
}

function normalizeHeader(h: string): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function maskPhone(p: string): string {
  if (p.length <= 6) return '****';
  return `${p.slice(0, 3)}****${p.slice(-3)}`;
}

function maskEmail(e: string): string {
  const [a, b] = e.split('@');
  if (!b) return '***';
  return `${a.slice(0, 2)}***@${b}`;
}

@Injectable()
export class ImportExportService implements OnModuleInit {
  private readonly dataRoot = path.join(process.cwd(), 'data');
  private readonly importDir = path.join(this.dataRoot, 'imports');
  private readonly exportDir = path.join(this.dataRoot, 'exports');

  constructor(
    private readonly prisma: PrismaService,
    private readonly phones: PhoneNormalizerService,
    private readonly wallet: WalletService,
    private readonly loyalty: LoyaltyService,
    private readonly segmentation: SegmentationService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    await ensureDir(this.importDir);
    await ensureDir(this.exportDir);
  }

  importTemplate(kind: ImportBatchKind): { filename: string; content: string } {
    const templates: Record<ImportBatchKind, string> = {
      CUSTOMER_MASTER:
        'phone_e164,display_name,email,member_tier,signup_source,preferred_store,tags\n+6591234567,Ada Member,ada@example.com,standard,otp,store-a,vip;inactive\n',
      WALLET_ADJUSTMENT:
        'phone_e164,amount_cents,reason\n+6591234567,1000,import_adjustment\n',
      LOYALTY_ADJUSTMENT:
        'phone_e164,delta_points,reason\n+6591234567,50,import_bonus\n',
      VOUCHER_ASSIGNMENT:
        'phone_e164,voucher_code\n+6591234567,WELCOME10\n',
      TAGS: 'phone_e164,tags\n+6591234567,vip;returning\n',
    };
    const name = `template_${kind.toLowerCase()}.csv`;
    return { filename: name, content: templates[kind] };
  }

  private async parseUpload(
    buffer: Buffer,
    originalName: string,
  ): Promise<Record<string, string>[]> {
    const lower = originalName.toLowerCase();
    if (lower.endsWith('.csv')) {
      const rows = parseCsv(buffer, {
        columns: (header) => header.map((h: string) => normalizeHeader(h)),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }) as Record<string, string>[];
      return rows;
    }
    if (lower.endsWith('.xlsx')) {
      const wb = new ExcelJS.Workbook();
      // Multer buffer is a Uint8Array-backed Buffer; exceljs typings are strict.
      // @ts-expect-error Buffer/Uint8Array mismatch between @types/node and exceljs
      await wb.xlsx.load(buffer);
      const sheet = wb.worksheets[0];
      if (!sheet) return [];
      const out: Record<string, string>[] = [];
      let headers: string[] = [];
      sheet.eachRow((row, rowNumber) => {
        const vals = row.values as unknown[];
        const cells = vals.slice(1).map((c) =>
          c == null ? '' : String(c).trim(),
        );
        if (rowNumber === 1) {
          headers = cells.map(normalizeHeader);
          return;
        }
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          if (h) obj[h] = cells[i] ?? '';
        });
        out.push(obj);
      });
      return out;
    }
    throw new BadRequestException({
      code: 'IMPORT_UNSUPPORTED_FORMAT',
      message: 'Upload .csv or .xlsx',
    });
  }

  async previewImport(
    kind: ImportBatchKind,
    file: Express.Multer.File,
    auth: AdminAuthState,
  ) {
    const uploadedBy = auth.actorLabel;
    if (!file?.buffer?.length) {
      throw new BadRequestException({ code: 'IMPORT_NO_FILE', message: 'Missing file' });
    }
    const rows = await this.parseUpload(file.buffer, file.originalname);
    const { errors, preview } = this.validateImport(kind, rows);
    const id = randomUUID();
    const storageName = `${id}${path.extname(file.originalname) || '.csv'}`;
    const storagePath = path.join(this.importDir, storageName);
    await fs.writeFile(storagePath, file.buffer);

    const batch = await this.prisma.importBatch.create({
      data: {
        id,
        kind,
        fileName: file.originalname,
        fileStoragePath: storagePath,
        uploadedBy,
        status: ImportBatchStatus.PREVIEW,
        totalRows: rows.length,
        failedRows: errors.length,
        successRows: 0,
        previewRows: preview as Prisma.InputJsonValue,
        rowErrors: errors.slice(0, 500) as Prisma.InputJsonValue,
        summary: {
          validRows: rows.length - errors.length,
          errorCount: errors.length,
        },
      },
    });
    return {
      batchId: batch.id,
      totalRows: rows.length,
      errors: errors.slice(0, 50),
      preview,
    };
  }

  private validateImport(
    kind: ImportBatchKind,
    rows: Record<string, string>[],
  ): {
    errors: { row: number; message: string }[];
    preview: Record<string, unknown>[];
  } {
    const errors: { row: number; message: string }[] = [];
    const seenPhones = new Set<string>();
    const preview: Record<string, unknown>[] = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const phoneRaw =
        row.phone_e164 ?? row.phone ?? row.phonee164 ?? row['phone_e164'] ?? '';
      if (!String(phoneRaw).trim()) {
        errors.push({ row: rowNum, message: 'Missing phone_e164' });
        return;
      }
      let phone: string;
      try {
        phone = this.phones.normalizeToE164(String(phoneRaw));
      } catch {
        errors.push({ row: rowNum, message: 'Invalid phone_e164' });
        return;
      }
      if (seenPhones.has(phone)) {
        errors.push({ row: rowNum, message: 'Duplicate phone in file' });
        return;
      }
      seenPhones.add(phone);

      if (kind === ImportBatchKind.CUSTOMER_MASTER) {
        preview.push({ phone_e164: phone, display_name: row.display_name });
      } else if (kind === ImportBatchKind.WALLET_ADJUSTMENT) {
        const n = Number(row.amount_cents);
        if (!Number.isInteger(n) || n === 0) {
          errors.push({ row: rowNum, message: 'amount_cents must be non-zero integer' });
          return;
        }
        preview.push({ phone_e164: phone, amount_cents: n });
      } else if (kind === ImportBatchKind.LOYALTY_ADJUSTMENT) {
        const n = Number(row.delta_points);
        if (!Number.isInteger(n) || n === 0) {
          errors.push({ row: rowNum, message: 'delta_points must be non-zero integer' });
          return;
        }
        preview.push({ phone_e164: phone, delta_points: n });
      } else if (kind === ImportBatchKind.VOUCHER_ASSIGNMENT) {
        const code = String(row.voucher_code ?? '').trim();
        if (!code) {
          errors.push({ row: rowNum, message: 'voucher_code required' });
          return;
        }
        preview.push({ phone_e164: phone, voucher_code: code });
      } else if (kind === ImportBatchKind.TAGS) {
        const tags = String(row.tags ?? '')
          .split(/[;,]/g)
          .map((t) => t.trim())
          .filter(Boolean);
        if (!tags.length) {
          errors.push({ row: rowNum, message: 'tags required' });
          return;
        }
        preview.push({ phone_e164: phone, tags });
      }
    });

    return { errors, preview: preview.slice(0, 20) };
  }

  async commitImport(batchId: string, auth: AdminAuthState) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException({ code: 'IMPORT_BATCH_NOT_FOUND', message: 'Batch not found' });
    }
    if (batch.status !== ImportBatchStatus.PREVIEW) {
      throw new BadRequestException({ code: 'IMPORT_ALREADY_COMMITTED', message: 'Batch not in preview state' });
    }
    if (!batch.fileStoragePath) {
      throw new BadRequestException({ code: 'IMPORT_FILE_MISSING', message: 'Original file not stored' });
    }
    const buf = await fs.readFile(batch.fileStoragePath);
    const rows = await this.parseUpload(buf, batch.fileName);
    const { errors } = this.validateImport(batch.kind, rows);

    let success = 0;
    const rowErrors = [...errors];
    const invalidRowNums = new Set(errors.map((e) => e.row));

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx]!;
      const rowNum = idx + 2;
      if (invalidRowNums.has(rowNum)) continue;

      const phoneRaw =
        row.phone_e164 ?? row.phone ?? '';
      let phone: string;
      try {
        phone = this.phones.normalizeToE164(String(phoneRaw));
      } catch {
        rowErrors.push({ row: rowNum, message: 'Invalid phone_e164' });
        continue;
      }

      try {
        await this.applyImportRow(batch.kind, row, phone);
        success++;
      } catch (e) {
        rowErrors.push({
          row: rowNum,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const failed = rowErrors.length;

    await this.prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: ImportBatchStatus.COMMITTED,
        successRows: success,
        failedRows: failed,
        rowErrors: rowErrors.slice(0, 2000) as Prisma.InputJsonValue,
        summary: {
          committedAt: new Date().toISOString(),
          success,
          failed,
        },
      },
    });

    await this.audit.log({
      ...auditActorBase(auth),
      action: 'import.performed',
      entityType: 'import_batch',
      entityId: batchId,
      afterValue: {
        kind: batch.kind,
        successRows: success,
        failedRows: failed,
      } as object,
    });

    return { batchId, successRows: success, failedRows: failed };
  }

  private async applyImportRow(
    kind: ImportBatchKind,
    row: Record<string, string>,
    phone: string,
  ) {
    const customer =
      (await this.prisma.customer.findUnique({ where: { phoneE164: phone } })) ??
      (await this.prisma.customer.create({
        data: {
          phoneE164: phone,
          status: CustomerStatus.ACTIVE,
        },
      }));

    await this.wallet.ensureWallet(customer.id);
    await this.loyalty.ensureWallet(customer.id);

    if (kind === ImportBatchKind.CUSTOMER_MASTER) {
      const tags = String(row.tags ?? '')
        .split(/[;,]/g)
        .map((t) => t.trim())
        .filter(Boolean);
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: {
          displayName: row.display_name || undefined,
          email: row.email || undefined,
          memberTier: row.member_tier || undefined,
          signupSource: row.signup_source || undefined,
          preferredStore: row.preferred_store || undefined,
          tags: tags.length ? { set: Array.from(new Set([...customer.tags, ...tags])) } : undefined,
        },
      });
      return;
    }

    if (kind === ImportBatchKind.WALLET_ADJUSTMENT) {
      const amountCents = Number(row.amount_cents);
      await this.wallet.appendTransaction({
        customerId: customer.id,
        type: WalletTxnType.MANUAL_ADJUSTMENT,
        amountCents,
        reason: String(row.reason ?? 'import_wallet_adjustment'),
        createdByType: 'admin',
        createdBy: 'import',
        metadata: { import: true },
      });
      return;
    }

    if (kind === ImportBatchKind.LOYALTY_ADJUSTMENT) {
      const deltaPoints = Number(row.delta_points);
      await this.loyalty.appendLedgerEntry({
        customerId: customer.id,
        deltaPoints,
        reason: String(row.reason ?? 'import_loyalty_adjustment'),
        referenceType: 'import',
      });
      return;
    }

    if (kind === ImportBatchKind.VOUCHER_ASSIGNMENT) {
      const code = String(row.voucher_code ?? '').trim();
      const def = await this.prisma.voucherDefinition.findUnique({
        where: { code },
      });
      if (!def || !def.isActive) {
        throw new Error(`Invalid voucher_code: ${code}`);
      }
      await this.prisma.customerVoucher.create({
        data: {
          customerId: customer.id,
          definitionId: def.id,
          status: 'ISSUED',
          referenceType: 'import_assign',
        },
      });
      return;
    }

    if (kind === ImportBatchKind.TAGS) {
      const tags = String(row.tags ?? '')
        .split(/[;,]/g)
        .map((t) => t.trim())
        .filter(Boolean);
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: {
          tags: { set: Array.from(new Set([...customer.tags, ...tags])) },
        },
      });
    }
  }

  async listImportBatches(limit = 50) {
    const take = Math.min(Math.max(limit, 1), 200);
    return this.prisma.importBatch.findMany({
      take,
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        kind: true,
        fileName: true,
        uploadedBy: true,
        uploadedAt: true,
        status: true,
        totalRows: true,
        successRows: true,
        failedRows: true,
        summary: true,
      },
    });
  }

  async getImportBatch(id: string) {
    const b = await this.prisma.importBatch.findUnique({ where: { id } });
    if (!b) {
      throw new NotFoundException({ code: 'IMPORT_BATCH_NOT_FOUND', message: 'Batch not found' });
    }
    return b;
  }

  async runExport(dto: ExportRequestDto, auth: AdminAuthState) {
    assertExportKindAllowed(auth, dto.kind);
    const job = await this.prisma.exportJob.create({
      data: {
        kind: dto.kind,
        format: dto.format,
        status: 'PENDING',
        params: dto as object,
        createdBy: auth.actorLabel,
      },
    });
    try {
      const { filename, buffer, rowCount } = await this.buildExport(dto);
      const outPath = path.join(this.exportDir, `${job.id}.${dto.format === 'XLSX' ? 'xlsx' : 'csv'}`);
      await fs.writeFile(outPath, buffer);
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          rowCount,
          fileName: filename,
          storagePath: outPath,
          completedAt: new Date(),
        },
      });
      await this.audit.log({
        ...auditActorBase(auth),
        action: 'export.performed',
        entityType: 'export_job',
        entityId: job.id,
        afterValue: {
          kind: dto.kind,
          format: dto.format,
          rowCount,
        } as object,
      });
      return { jobId: job.id, rowCount, fileName: filename };
    } catch (e) {
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: e instanceof Error ? e.message : String(e),
          completedAt: new Date(),
        },
      });
      throw e;
    }
  }

  private async buildExport(
    dto: ExportRequestDto,
  ): Promise<{ filename: string; buffer: Buffer; rowCount: number }> {
    const mask = dto.maskSensitive === true;
    let segmentFilters: SegmentFiltersDto | undefined = dto.segmentFilters;
    if (dto.audienceId) {
      const a = await this.prisma.segmentAudience.findUnique({
        where: { id: dto.audienceId },
      });
      if (!a) {
        throw new BadRequestException({ code: 'AUDIENCE_NOT_FOUND', message: 'Audience not found' });
      }
      segmentFilters = a.filters as SegmentFiltersDto;
    }

    const dateFrom = dto.dateFrom ? new Date(dto.dateFrom) : undefined;
    const dateTo = dto.dateTo ? new Date(dto.dateTo) : undefined;
    if (dateTo) dateTo.setHours(23, 59, 59, 999);

    switch (dto.kind) {
      case 'CUSTOMERS':
        return this.exportCustomers(segmentFilters ?? {}, dto.format, mask);
      case 'WALLET_LEDGER':
        return this.exportWalletLedger(dto.format, dto.customerId, dateFrom, dateTo);
      case 'POINTS_LEDGER':
        return this.exportPointsLedger(dto.format, dto.customerId, dateFrom, dateTo);
      case 'VOUCHERS_ISSUED':
        return this.exportVouchers(dto.format, 'ISSUED', dto.customerId, dateFrom, dateTo);
      case 'VOUCHERS_REDEEMED':
        return this.exportVouchers(dto.format, 'REDEEMED', dto.customerId, dateFrom, dateTo);
      case 'AUDIT_LOGS':
        return this.exportAuditLogs(dto.format, dateFrom, dateTo);
      case 'IMPORT_BATCHES':
        return this.exportImportBatchesMeta(dto.format);
      case 'SEGMENT_AUDIENCE':
        return this.exportCustomers(segmentFilters ?? {}, dto.format, mask);
      default:
        throw new BadRequestException({ code: 'EXPORT_UNKNOWN_KIND', message: 'Unknown export kind' });
    }
  }

  private async exportCustomers(
    filters: SegmentFiltersDto,
    format: 'CSV' | 'XLSX',
    mask: boolean,
  ) {
    const rows: Record<string, unknown>[] = [];
    for await (const batch of this.segmentation.iterateSegmentIds(filters, 300)) {
      const customers = await this.prisma.customer.findMany({
        where: { id: { in: batch } },
        include: { wallet: true, storedWallet: true },
      });
      for (const c of customers) {
        rows.push({
          id: c.id,
          phone_e164: mask ? maskPhone(c.phoneE164) : c.phoneE164,
          display_name: c.displayName,
          email: c.email ? (mask ? maskEmail(c.email) : c.email) : '',
          status: c.status,
          member_tier: c.memberTier,
          signup_source: c.signupSource,
          preferred_store: c.preferredStore ?? '',
          tags: c.tags.join(';'),
          points_balance: c.wallet?.pointsCached ?? 0,
          wallet_balance_cents: c.storedWallet?.balanceCents ?? 0,
          created_at: c.createdAt.toISOString(),
          last_login_at: c.lastLoginAt?.toISOString() ?? '',
        });
      }
    }
    return this.rowsToFile(rows, 'customers_export', format);
  }

  private async exportWalletLedger(
    format: 'CSV' | 'XLSX',
    customerId?: string,
    dateFrom?: Date,
    dateTo?: Date,
  ) {
    const rows = await this.prisma.storedWalletLedgerEntry.findMany({
      where: {
        customerId: customerId ?? undefined,
        createdAt: {
          gte: dateFrom,
          lte: dateTo,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50_000,
      include: {
        customer: { select: { phoneE164: true } },
      },
    });
    const data = rows.map((r) => ({
      id: r.id,
      customer_id: r.customerId,
      phone_e164: r.customer.phoneE164,
      type: r.type,
      amount_cents: r.amountCents,
      balance_before: r.balanceBefore,
      balance_after: r.balanceAfter,
      reason: r.reason,
      created_by_type: r.createdByType,
      created_at: r.createdAt.toISOString(),
    }));
    return this.rowsToFile(data, 'wallet_ledger', format);
  }

  private async exportPointsLedger(
    format: 'CSV' | 'XLSX',
    customerId?: string,
    dateFrom?: Date,
    dateTo?: Date,
  ) {
    const rows = await this.prisma.loyaltyLedgerEntry.findMany({
      where: {
        customerId: customerId ?? undefined,
        createdAt: {
          gte: dateFrom,
          lte: dateTo,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50_000,
      include: { customer: { select: { phoneE164: true } } },
    });
    const data = rows.map((r) => ({
      id: r.id,
      customer_id: r.customerId,
      phone_e164: r.customer.phoneE164,
      delta_points: r.deltaPoints,
      balance_after: r.balanceAfter,
      reason: r.reason,
      reference_type: r.referenceType ?? '',
      created_at: r.createdAt.toISOString(),
    }));
    return this.rowsToFile(data, 'points_ledger', format);
  }

  private async exportVouchers(
    format: 'CSV' | 'XLSX',
    status: 'ISSUED' | 'REDEEMED',
    customerId?: string,
    dateFrom?: Date,
    dateTo?: Date,
  ) {
    const dateFilter =
      dateFrom || dateTo
        ? { gte: dateFrom, lte: dateTo }
        : undefined;
    const rows = await this.prisma.customerVoucher.findMany({
      where: {
        status,
        customerId: customerId ?? undefined,
        ...(status === 'REDEEMED'
          ? { redeemedAt: dateFilter }
          : { issuedAt: dateFilter }),
      },
      orderBy: { issuedAt: 'desc' },
      take: 50_000,
      include: {
        customer: { select: { phoneE164: true } },
        definition: { select: { code: true, title: true } },
      },
    });
    const data = rows.map((r) => ({
      id: r.id,
      customer_id: r.customerId,
      phone_e164: r.customer.phoneE164,
      voucher_code: r.definition.code,
      title: r.definition.title,
      status: r.status,
      issued_at: r.issuedAt.toISOString(),
      redeemed_at: r.redeemedAt?.toISOString() ?? '',
    }));
    return this.rowsToFile(data, `vouchers_${status.toLowerCase()}`, format);
  }

  private async exportAuditLogs(
    format: 'CSV' | 'XLSX',
    dateFrom?: Date,
    dateTo?: Date,
  ) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        createdAt: {
          gte: dateFrom,
          lte: dateTo,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50_000,
    });
    const data = rows.map((r) => ({
      id: r.id,
      actor_type: r.actorType,
      actor_id: r.actorId ?? '',
      action: r.action,
      entity_type: r.entityType,
      entity_id: r.entityId ?? '',
      created_at: r.createdAt.toISOString(),
      metadata: r.metadata ? JSON.stringify(r.metadata) : '',
    }));
    return this.rowsToFile(data, 'audit_logs', format);
  }

  private async exportImportBatchesMeta(format: 'CSV' | 'XLSX') {
    const rows = await this.prisma.importBatch.findMany({
      orderBy: { uploadedAt: 'desc' },
      take: 5000,
    });
    const data = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      file_name: r.fileName,
      uploaded_by: r.uploadedBy,
      uploaded_at: r.uploadedAt.toISOString(),
      status: r.status,
      total_rows: r.totalRows,
      success_rows: r.successRows,
      failed_rows: r.failedRows,
    }));
    return this.rowsToFile(data, 'import_batches', format);
  }

  private async rowsToFile(
    rows: Record<string, unknown>[],
    baseName: string,
    format: 'CSV' | 'XLSX',
  ): Promise<{ filename: string; buffer: Buffer; rowCount: number }> {
    const rowCount = rows.length;
    if (format === 'CSV') {
      const cols =
        rows.length > 0
          ? Object.keys(rows[0]!)
          : [];
      const csv = stringify(rows, { header: true, columns: cols });
      return {
        filename: `${baseName}.csv`,
        buffer: Buffer.from(csv, 'utf8'),
        rowCount,
      };
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Export');
    if (rows.length) {
      const cols = Object.keys(rows[0]!);
      ws.addRow(cols);
      for (const r of rows) {
        ws.addRow(cols.map((c) => r[c] ?? ''));
      }
    }
    const buf = await wb.xlsx.writeBuffer();
    return {
      filename: `${baseName}.xlsx`,
      buffer: Buffer.from(buf),
      rowCount,
    };
  }

  async listExportJobs(limit = 50) {
    const take = Math.min(Math.max(limit, 1), 200);
    return this.prisma.exportJob.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        kind: true,
        format: true,
        status: true,
        rowCount: true,
        fileName: true,
        createdBy: true,
        createdAt: true,
        completedAt: true,
        errorMessage: true,
      },
    });
  }

  async getExportJobFile(jobId: string): Promise<{ path: string; fileName: string }> {
    const job = await this.prisma.exportJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'COMPLETED' || !job.storagePath || !job.fileName) {
      throw new NotFoundException({ code: 'EXPORT_NOT_READY', message: 'Export not available' });
    }
    return { path: job.storagePath, fileName: job.fileName };
  }
}
