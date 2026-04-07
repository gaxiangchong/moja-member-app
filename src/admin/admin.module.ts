import { Module } from '@nestjs/common';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [LoyaltyModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
