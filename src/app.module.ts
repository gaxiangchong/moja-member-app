import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { HealthController } from './health/health.controller';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { PrismaModule } from './prisma/prisma.module';
import { RewardsModule } from './rewards/rewards.module';
import { AdminDashboardController } from './ui/admin-dashboard.controller';
import { WalletModule } from './wallet/wallet.module';
import { SegmentationModule } from './segmentation/segmentation.module';
import { ImportExportModule } from './import-export/import-export.module';
import { MasterDataModule } from './master-data/master-data.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    AdminAuthModule,
    AuditModule,
    LoyaltyModule,
    CustomersModule,
    AuthModule,
    AdminModule,
    RewardsModule,
    WalletModule,
    SegmentationModule,
    ImportExportModule,
    MasterDataModule,
  ],
  controllers: [HealthController, AdminDashboardController],
})
export class AppModule {}
