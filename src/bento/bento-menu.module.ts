import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BentoMenuService } from './bento-menu.service';
import { BentoOrdersReportService } from './bento-orders-report.service';

/**
 * Standalone, dependency-light module so both the bento module (public reads)
 * and the admin module (editing + reports) can share bento menu / order data
 * without pulling in payments/Prisma or creating circular imports.
 */
@Module({
  imports: [PrismaModule],
  providers: [BentoMenuService, BentoOrdersReportService],
  exports: [BentoMenuService, BentoOrdersReportService],
})
export class BentoMenuModule {}
