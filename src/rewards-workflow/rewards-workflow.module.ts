import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { JwtAccessModule } from '../auth/jwt-access.module';
import { RewardsWorkflowAdminController } from './rewards-workflow-admin.controller';
import { RewardsWorkflowController } from './rewards-workflow.controller';
import { RewardsWorkflowService } from './rewards-workflow.service';

@Module({
  imports: [JwtAccessModule, AdminAuthModule],
  controllers: [RewardsWorkflowController, RewardsWorkflowAdminController],
  providers: [RewardsWorkflowService],
  exports: [RewardsWorkflowService],
})
export class RewardsWorkflowModule {}
