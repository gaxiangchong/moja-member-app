import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { SalesplayService } from './salesplay.service';
import { SalesplayWebhookService } from './salesplay-webhook.service';
import { SalesplayWebhookController } from './salesplay-webhook.controller';

@Module({
  imports: [ConfigModule, LoyaltyModule],
  controllers: [SalesplayWebhookController],
  providers: [SalesplayService, SalesplayWebhookService],
  exports: [SalesplayService],
})
export class SalesplayModule {}
