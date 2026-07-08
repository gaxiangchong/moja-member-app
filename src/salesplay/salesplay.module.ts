import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { ReportingSettingsModule } from '../admin/reporting-settings.module';
import { SalesplayService } from './salesplay.service';
import { SalesplayWebhookService } from './salesplay-webhook.service';
import { SalesplayWebhookController } from './salesplay-webhook.controller';
import { SalesplayPullService } from './salesplay-pull.service';

@Module({
  imports: [ConfigModule, LoyaltyModule, ReportingSettingsModule],
  controllers: [SalesplayWebhookController],
  providers: [SalesplayService, SalesplayWebhookService, SalesplayPullService],
  exports: [SalesplayService, SalesplayPullService],
})
export class SalesplayModule {}
