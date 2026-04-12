import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { OpsQueueController } from './ops-queue.controller';
import { OpsQueueService } from './ops-queue.service';
import { OpsApiKeyGuard } from './guards/ops-api-key.guard';

@Module({
  imports: [EmployeesModule],
  controllers: [OpsQueueController],
  providers: [OpsQueueService, OpsApiKeyGuard],
})
export class OpsQueueModule {}
