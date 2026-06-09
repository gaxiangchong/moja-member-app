import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BentoMenuService } from './bento-menu.service';
import { BentoOrdersReportService } from './bento-orders-report.service';
import { BentoPackagesService } from './bento-packages.service';
import { BentoSettingsService } from './bento-settings.service';
import { BentoFeaturesService } from './bento-features.service';

/**
 * Standalone, dependency-light module so both the bento module (public reads)
 * and the admin module (editing + reports) can share bento menu / order data
 * without pulling in payments/Prisma or creating circular imports.
 */
@Module({
  imports: [PrismaModule],
  providers: [BentoMenuService, BentoOrdersReportService, BentoPackagesService, BentoSettingsService, BentoFeaturesService],
  exports: [BentoMenuService, BentoOrdersReportService, BentoPackagesService, BentoSettingsService, BentoFeaturesService],
})
export class BentoMenuModule {}
