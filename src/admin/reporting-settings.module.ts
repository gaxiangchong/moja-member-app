import { Module } from '@nestjs/common';
import { ReportingSettingsService } from './reporting-settings.service';

/**
 * Shares the file-backed {@link ReportingSettingsService} (sales reporting start
 * date) so bento order reads can honour the same cutoff the sales reports use.
 * Dependency-light: no Prisma, safe to import anywhere without circular risk.
 */
@Module({
  providers: [ReportingSettingsService],
  exports: [ReportingSettingsService],
})
export class ReportingSettingsModule {}
