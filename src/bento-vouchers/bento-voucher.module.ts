import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BentoVoucherService } from './bento-voucher.service';

/**
 * Shared discount-code vouchers redeemed at bento checkout. The service is
 * consumed by BentoModule (quote/checkout) and PaymentsModule (confirm/release
 * on payment outcome), so the module only owns the service and exports it.
 */
@Module({
  imports: [PrismaModule],
  providers: [BentoVoucherService],
  exports: [BentoVoucherService],
})
export class BentoVoucherModule {}
