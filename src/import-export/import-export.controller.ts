import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { ImportBatchKind } from '@prisma/client';
import { CurrentAdmin } from '../admin-auth/decorators/current-admin.decorator';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { ImportExportService } from './import-export.service';
import { ExportRequestDto } from './dto/export-request.dto';

function parseImportKind(raw: string): ImportBatchKind {
  const v = raw?.toUpperCase();
  const allowed = Object.values(ImportBatchKind) as string[];
  if (!allowed.includes(v)) {
    throw new BadRequestException({
      code: 'IMPORT_INVALID_KIND',
      message: `Invalid import kind: ${raw}`,
    });
  }
  return v as ImportBatchKind;
}

@Controller('admin')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class ImportExportController {
  constructor(private readonly io: ImportExportService) {}

  @Get('import/templates/:kind')
  @RequirePermissions(P.IMPORT_PREVIEW)
  downloadTemplate(@Param('kind') kindRaw: string) {
    const kind = parseImportKind(kindRaw);
    const { filename, content } = this.io.importTemplate(kind);
    return new StreamableFile(Buffer.from(content, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Post('import/preview/:kind')
  @RequirePermissions(P.IMPORT_PREVIEW)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  preview(
    @Param('kind') kindRaw: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    const kind = parseImportKind(kindRaw);
    return this.io.previewImport(kind, file, auth);
  }

  @Post('import/batches/:batchId/commit')
  @RequirePermissions(P.IMPORT_COMMIT)
  commit(
    @Param('batchId') batchId: string,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.io.commitImport(batchId, auth);
  }

  @Get('import/batches')
  @RequirePermissions(P.IMPORT_PREVIEW)
  listBatches() {
    return this.io.listImportBatches();
  }

  @Get('import/batches/:id')
  @RequirePermissions(P.IMPORT_PREVIEW)
  getBatch(@Param('id') id: string) {
    return this.io.getImportBatch(id);
  }

  @Post('export/run')
  @RequirePermissions(P.EXPORT_RUN)
  runExport(
    @Body() dto: ExportRequestDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.io.runExport(dto, auth);
  }

  @Get('export/jobs')
  @RequirePermissions(P.EXPORT_RUN)
  listJobs() {
    return this.io.listExportJobs();
  }

  @Get('export/jobs/:id/download')
  @RequirePermissions(P.EXPORT_RUN)
  async downloadExport(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { path: filePath, fileName } = await this.io.getExportJobFile(id);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }
}
