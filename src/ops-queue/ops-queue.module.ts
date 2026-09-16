import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { ReportingSettingsModule } from '../admin/reporting-settings.module';
import { ShopCatalogModule } from '../shop-catalog/shop-catalog.module';
import { OpsQueueController } from './ops-queue.controller';
import { OpsKitchenController } from './ops-kitchen.controller';
import { OpsQueueService } from './ops-queue.service';
import { OpsApiKeyGuard } from './guards/ops-api-key.guard';

@Module({
  imports: [EmployeesModule, ReportingSettingsModule, ShopCatalogModule],
  controllers: [OpsQueueController, OpsKitchenController],
  providers: [OpsQueueService, OpsApiKeyGuard],
})
export class OpsQueueModule {}
