import { Module } from '@nestjs/common';
import { JwtAccessModule } from '../auth/jwt-access.module';
import { CustomersModule } from '../customers/customers.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RewardsWorkflowModule } from '../rewards-workflow/rewards-workflow.module';
import { WalletModule } from '../wallet/wallet.module';
import { BentoVoucherModule } from '../bento-vouchers/bento-voucher.module';
import { ShopCatalogModule } from '../shop-catalog/shop-catalog.module';
import { PaymentsController, WebhooksController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { XenditApiService } from './xendit-api.service';

@Module({
  imports: [
    PrismaModule,
    WalletModule,
    JwtAccessModule,
    CustomersModule,
    LoyaltyModule,
    RewardsWorkflowModule,
    NotificationsModule,
    BentoVoucherModule,
    ShopCatalogModule,
  ],
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentsService, XenditApiService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
