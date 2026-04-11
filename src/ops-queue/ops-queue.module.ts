import { Module } from '@nestjs/common';
import { OpsQueueController } from './ops-queue.controller';
import { OpsQueueService } from './ops-queue.service';
import { OpsApiKeyGuard } from './guards/ops-api-key.guard';

@Module({
  controllers: [OpsQueueController],
  providers: [OpsQueueService, OpsApiKeyGuard],
})
export class OpsQueueModule {}
