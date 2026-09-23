import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrdersModule } from '../orders/orders.module';
import { CustomersModule } from '../customers/customers.module';
import { EmployeesModule } from '../employees/employees.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { WalletModule } from '../wallet/wallet.module';
import { ReportingSettingsModule } from '../admin/reporting-settings.module';
import { ShopCatalogModule } from '../shop-catalog/shop-catalog.module';
import { OpsQueueController } from './ops-queue.controller';
import { OpsKitchenController } from './ops-kitchen.controller';
import { OpsMembersController } from './ops-members.controller';
import { OpsMembersService } from './ops-members.service';
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
  ],
  controllers: [OpsQueueController, OpsKitchenController, OpsMembersController],
  providers: [OpsQueueService, OpsMembersService, OpsApiKeyGuard],
})
export class OpsQueueModule {}
