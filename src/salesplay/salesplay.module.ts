import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { ReportingSettingsModule } from '../admin/reporting-settings.module';
import { ShopCatalogModule } from '../shop-catalog/shop-catalog.module';
import { OrdersModule } from '../orders/orders.module';
import { RewardsWorkflowModule } from '../rewards-workflow/rewards-workflow.module';
import { SalesplayService } from './salesplay.service';
import { SalesplayWebhookService } from './salesplay-webhook.service';
import { SalesplayWebhookController } from './salesplay-webhook.controller';
import { SalesplayPullService } from './salesplay-pull.service';
import { SalesplayLiveSyncService } from './salesplay-live-sync.service';

@Module({
  imports: [
    ConfigModule,
    LoyaltyModule,
    ReportingSettingsModule,
    ShopCatalogModule,
    OrdersModule,
    RewardsWorkflowModule,
  ],
  controllers: [SalesplayWebhookController],
  providers: [
    SalesplayService,
    SalesplayWebhookService,
    SalesplayPullService,
    SalesplayLiveSyncService,
  ],
  exports: [SalesplayService, SalesplayPullService, SalesplayLiveSyncService],
})
export class SalesplayModule {}
