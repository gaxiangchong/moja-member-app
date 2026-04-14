import { Module } from '@nestjs/common';
import { JwtAccessModule } from '../auth/jwt-access.module';
import { CustomersModule } from '../customers/customers.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentsController, WebhooksController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { XenditApiService } from './xendit-api.service';

@Module({
  imports: [PrismaModule, WalletModule, JwtAccessModule, CustomersModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentsService, XenditApiService],
})
export class PaymentsModule {}
