import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { JwtAccessModule } from '../auth/jwt-access.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { CampaignAdminController } from './campaign-admin.controller';
import { CampaignAutomationService } from './campaign-automation.service';
import { CampaignBuilderService } from './campaign-builder.service';
import { RewardsWorkflowAdminController } from './rewards-workflow-admin.controller';
import { RewardsWorkflowController } from './rewards-workflow.controller';
import { RewardsWorkflowService } from './rewards-workflow.service';

@Module({
  imports: [JwtAccessModule, AdminAuthModule, LoyaltyModule],
  controllers: [
    RewardsWorkflowController,
    RewardsWorkflowAdminController,
    CampaignAdminController,
  ],
  providers: [
    RewardsWorkflowService,
    CampaignBuilderService,
    CampaignAutomationService,
  ],
  exports: [
    RewardsWorkflowService,
    CampaignBuilderService,
    CampaignAutomationService,
  ],
})
export class RewardsWorkflowModule {}
