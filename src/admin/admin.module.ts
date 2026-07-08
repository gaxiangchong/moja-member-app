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
import { FinanceReportService } from './finance-report.service';
import { ReportingSettingsModule } from './reporting-settings.module';
import { ShopCatalogModule } from '../shop-catalog/shop-catalog.module';
import { HomeAdsModule } from '../home-ads/home-ads.module';
import { EmployeesModule } from '../employees/employees.module';
import { AdminEmployeesController } from './admin-employees.controller';
import { BentoMenuModule } from '../bento/bento-menu.module';
import { BentoModule } from '../bento/bento.module';
import { BentoVoucherModule } from '../bento-vouchers/bento-voucher.module';
import { PaymentsModule } from '../payments/payments.module';
import { SalesplayModule } from '../salesplay/salesplay.module';

@Module({
  imports: [
    AdminAuthModule,
    LoyaltyModule,
    CustomersModule,
    WalletModule,
    ShopCatalogModule,
    HomeAdsModule,
    EmployeesModule,
    BentoMenuModule,
    BentoModule,
    ReportingSettingsModule,
    BentoVoucherModule,
    PaymentsModule,
    SalesplayModule,
  ],
  controllers: [
    AdminController,
    AdminApprovalsController,
    AdminReportsController,
    AdminEmployeesController,
  ],
  providers: [AdminService, ApprovalsService, FinanceReportService],
})
export class AdminModule {}
