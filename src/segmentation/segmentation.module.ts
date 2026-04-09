import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { WalletModule } from '../wallet/wallet.module';
import { SegmentationController } from './segmentation.controller';
import { SegmentationService } from './segmentation.service';

@Module({
  imports: [AdminAuthModule, LoyaltyModule, WalletModule],
  controllers: [SegmentationController],
  providers: [SegmentationService],
  exports: [SegmentationService],
})
export class SegmentationModule {}
