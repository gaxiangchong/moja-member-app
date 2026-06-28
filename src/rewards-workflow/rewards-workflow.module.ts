import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { JwtAccessModule } from '../auth/jwt-access.module';
import { CampaignAdminController } from './campaign-admin.controller';
import { CampaignBuilderService } from './campaign-builder.service';
import { RewardsWorkflowAdminController } from './rewards-workflow-admin.controller';
import { RewardsWorkflowController } from './rewards-workflow.controller';
import { RewardsWorkflowService } from './rewards-workflow.service';

@Module({
  imports: [JwtAccessModule, AdminAuthModule],
  controllers: [
    RewardsWorkflowController,
    RewardsWorkflowAdminController,
    CampaignAdminController,
  ],
  providers: [RewardsWorkflowService, CampaignBuilderService],
  exports: [RewardsWorkflowService, CampaignBuilderService],
})
export class RewardsWorkflowModule {}
