import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrdersModule } from '../orders/orders.module';
import { CustomersModule } from '../customers/customers.module';
import { EmployeesModule } from '../employees/employees.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { WalletModule } from '../wallet/wallet.module';
import { ReportingSettingsModule } from '../admin/reporting-settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RewardsWorkflowModule } from '../rewards-workflow/rewards-workflow.module';
import { ShopCatalogModule } from '../shop-catalog/shop-catalog.module';
import { OpsQueueController } from './ops-queue.controller';
import { OpsKitchenController } from './ops-kitchen.controller';
import { OpsMembersController } from './ops-members.controller';
import { OpsMembersService } from './ops-members.service';
import { OpsRedemptionsController } from './ops-redemptions.controller';
import { OpsRedemptionsService } from './ops-redemptions.service';
import { OpsQueueService } from './ops-queue.service';
import { OpsApiKeyGuard } from './guards/ops-api-key.guard';

@Module({
  imports: [
    OrdersModule,
    AuditModule,
    CustomersModule,
    EmployeesModule,
    LoyaltyModule,
    ReportingSettingsModule,
    ShopCatalogModule,
    WalletModule,
    NotificationsModule,
    RewardsWorkflowModule,
  ],
  controllers: [
    OpsQueueController,
    OpsKitchenController,
    OpsMembersController,
    OpsRedemptionsController,
  ],
  providers: [
    OpsQueueService,
    OpsMembersService,
    OpsRedemptionsService,
    OpsApiKeyGuard,
  ],
})
export class OpsQueueModule {}
