import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentAdmin } from '../admin-auth/decorators/current-admin.decorator';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { CampaignRunDto } from './dto/campaign-run.dto';
import { SaveAudienceDto } from './dto/save-audience.dto';
import { SegmentFiltersDto } from './dto/segment-filters.dto';
import { SegmentationService } from './segmentation.service';
import { CampaignInsightsQueryDto } from './dto/campaign-insights-query.dto';

@Controller('admin/segments')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class SegmentationController {
  constructor(private readonly segmentation: SegmentationService) {}

  @Post('preview')
  @RequirePermissions(P.SEGMENT_MANAGE)
  preview(@Body() filters: SegmentFiltersDto) {
    return this.segmentation.previewSegment(filters);
  }

  @Get('audiences')
  @RequirePermissions(P.SEGMENT_MANAGE)
  listAudiences() {
    return this.segmentation.listAudiences();
  }

  @Post('audiences')
  @RequirePermissions(P.SEGMENT_MANAGE)
  createAudience(@Body() dto: SaveAudienceDto) {
    return this.segmentation.saveAudience(dto);
  }

  @Get('audiences/:id')
  @RequirePermissions(P.SEGMENT_MANAGE)
  getAudience(@Param('id') id: string) {
    return this.segmentation.getAudience(id);
  }

  @Patch('audiences/:id')
  @RequirePermissions(P.SEGMENT_MANAGE)
  updateAudience(
    @Param('id') id: string,
    @Body() dto: Partial<Pick<SaveAudienceDto, 'name' | 'description' | 'filters'>>,
  ) {
    return this.segmentation.updateAudience(id, dto);
  }

  @Delete('audiences/:id')
  @RequirePermissions(P.SEGMENT_MANAGE)
  deleteAudience(@Param('id') id: string) {
    return this.segmentation.deleteAudience(id);
  }

  @Post('audiences/:id/preview')
  @RequirePermissions(P.SEGMENT_MANAGE)
  async previewAudience(@Param('id') id: string) {
    const a = await this.segmentation.getAudience(id);
    return this.segmentation.previewSegment(a.filters as SegmentFiltersDto);
  }

  @Post('campaigns/run')
  @RequirePermissions(P.CAMPAIGN_RUN)
  runCampaign(
    @Body() dto: CampaignRunDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.segmentation.runCampaign(dto, auth.actorLabel);
  }

  @Get('campaigns/run/:runId/status')
  @RequirePermissions(P.CAMPAIGN_RUN)
  campaignRunStatus(@Param('runId') runId: string) {
    return this.segmentation.getCampaignRunStatus(runId);
  }

  @Get('campaigns/insights')
  @RequirePermissions(P.SEGMENT_MANAGE)
  campaignInsights(@Query() query: CampaignInsightsQueryDto) {
    return this.segmentation.getCampaignInsights(query);
  }
}
