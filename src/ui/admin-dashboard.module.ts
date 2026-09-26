import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminDashboardMenuAdminController } from './admin-dashboard-menu.admin.controller';
import { AdminDashboardMenuService } from './admin-dashboard-menu.service';
import { AdminDashboardController } from './admin-dashboard.controller';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminDashboardController, AdminDashboardMenuAdminController],
  providers: [AdminDashboardMenuService],
})
export class AdminDashboardModule {}
