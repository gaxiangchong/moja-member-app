import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { CustomersModule } from '../customers/customers.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdminApprovalsController } from './admin-approvals.controller';
import { AdminReportsController } from './admin-reports.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ApprovalsService } from './approvals.service';
import { ShopCatalogModule } from '../shop-catalog/shop-catalog.module';

@Module({
  imports: [AdminAuthModule, LoyaltyModule, CustomersModule, WalletModule, ShopCatalogModule],
  controllers: [
    AdminController,
    AdminApprovalsController,
    AdminReportsController,
  ],
  providers: [AdminService, ApprovalsService],
})
export class AdminModule {}
