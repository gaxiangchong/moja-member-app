import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { CustomersModule } from '../customers/customers.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { SegmentationModule } from '../segmentation/segmentation.module';
import { WalletModule } from '../wallet/wallet.module';
import { ImportExportController } from './import-export.controller';
import { ImportExportService } from './import-export.service';

@Module({
  imports: [
    AdminAuthModule,
    CustomersModule,
    WalletModule,
    LoyaltyModule,
    SegmentationModule,
  ],
  controllers: [ImportExportController],
  providers: [ImportExportService],
})
export class ImportExportModule {}
