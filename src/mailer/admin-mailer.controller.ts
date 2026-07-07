import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EmailAudienceKind } from '@prisma/client';
import { CurrentAdmin } from '../admin-auth/decorators/current-admin.decorator';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { MailerService } from './mailer.service';
import {
  CreateCampaignDto,
  ScheduleCampaignDto,
  TestSendDto,
  UpdateCampaignDto,
} from './dto/upsert-campaign.dto';

@Controller('admin/mailer')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@RequirePermissions(P.CAMPAIGN_RUN)
export class AdminMailerController {
  constructor(private readonly mailer: MailerService) {}

  @Get('templates')
  getTemplates() {
    return this.mailer.getTemplates();
  }

  @Get('audience-preview')
  audiencePreview(
    @Query('audience') audience?: string,
    @Query('tier') tier?: string,
  ) {
    const kind =
      audience === EmailAudienceKind.ALL_WITH_EMAIL
        ? EmailAudienceKind.ALL_WITH_EMAIL
        : EmailAudienceKind.OPTED_IN;
    return this.mailer.audiencePreview(kind, tier?.trim() || null);
  }

  @Get('campaigns')
  listCampaigns() {
    return this.mailer.listCampaigns();
  }

  @Post('campaigns')
  createCampaign(
    @Body() dto: CreateCampaignDto,
    @CurrentAdmin() admin: AdminAuthState,
  ) {
    return this.mailer.createCampaign(dto, admin?.actorLabel ?? null);
  }

  @Get('campaigns/:id')
  getCampaign(@Param('id', ParseUUIDPipe) id: string) {
    return this.mailer.getCampaign(id);
  }

  @Patch('campaigns/:id')
  updateCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.mailer.updateCampaign(id, dto);
  }

  @Delete('campaigns/:id')
  deleteCampaign(@Param('id', ParseUUIDPipe) id: string) {
    return this.mailer.deleteCampaign(id);
  }

  @Post('campaigns/:id/duplicate')
  duplicateCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminAuthState,
  ) {
    return this.mailer.duplicateCampaign(id, admin?.actorLabel ?? null);
  }

  @Get('campaigns/:id/preview')
  previewCampaign(@Param('id', ParseUUIDPipe) id: string) {
    return this.mailer.previewCampaign(id);
  }

  @Post('campaigns/:id/test-send')
  testSend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TestSendDto,
  ) {
    return this.mailer.testSend(id, dto.email);
  }

  @Post('campaigns/:id/schedule')
  scheduleCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleCampaignDto,
  ) {
    return this.mailer.scheduleCampaign(id, dto.scheduledAt);
  }

  @Post('campaigns/:id/cancel')
  cancelCampaign(@Param('id', ParseUUIDPipe) id: string) {
    return this.mailer.cancelCampaign(id);
  }
}
