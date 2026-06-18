import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { ReportingSettingsModule } from '../admin/reporting-settings.module';
import { OpsQueueController } from './ops-queue.controller';
import { OpsQueueService } from './ops-queue.service';
import { OpsApiKeyGuard } from './guards/ops-api-key.guard';

@Module({
  imports: [EmployeesModule, ReportingSettingsModule],
  controllers: [OpsQueueController],
  providers: [OpsQueueService, OpsApiKeyGuard],
})
export class OpsQueueModule {}
