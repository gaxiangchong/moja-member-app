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
import { BusinessRuleKind, MasterEntryCategory } from '@prisma/client';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import {
  CreateBusinessRuleDto,
  UpdateBusinessRuleDto,
} from './dto/business-rule.dto';
import {
  CreateMasterEntryDto,
  UpdateMasterEntryDto,
} from './dto/master-entry.dto';
import { MasterDataService } from './master-data.service';

@Controller('admin/master')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class MasterDataController {
  constructor(private readonly master: MasterDataService) {}

  @Get('entries')
  @RequirePermissions(P.MASTER_MANAGE)
  listEntries(@Query('category') category?: string) {
    if (!category) return this.master.listEntries();
    if (
      !Object.values(MasterEntryCategory).includes(category as MasterEntryCategory)
    ) {
      return this.master.listEntries();
    }
    return this.master.listEntries(category as MasterEntryCategory);
  }

  @Post('entries')
  @RequirePermissions(P.MASTER_MANAGE)
  createEntry(@Body() dto: CreateMasterEntryDto) {
    return this.master.createEntry(dto);
  }

  @Patch('entries/:id')
  @RequirePermissions(P.MASTER_MANAGE)
  updateEntry(@Param('id') id: string, @Body() dto: UpdateMasterEntryDto) {
    return this.master.updateEntry(id, dto);
  }

  @Delete('entries/:id')
  @RequirePermissions(P.MASTER_MANAGE)
  deleteEntry(@Param('id') id: string) {
    return this.master.deleteEntry(id);
  }

  @Get('rules')
  @RequirePermissions(P.MASTER_MANAGE)
  listRules(@Query('kind') kind?: string) {
    if (!kind) return this.master.listRules();
    if (!Object.values(BusinessRuleKind).includes(kind as BusinessRuleKind)) {
      return this.master.listRules();
    }
    return this.master.listRules(kind as BusinessRuleKind);
  }

  @Post('rules')
  @RequirePermissions(P.MASTER_MANAGE)
  createRule(@Body() dto: CreateBusinessRuleDto) {
    return this.master.createRule(dto);
  }

  @Patch('rules/:id')
  @RequirePermissions(P.MASTER_MANAGE)
  updateRule(@Param('id') id: string, @Body() dto: UpdateBusinessRuleDto) {
    return this.master.updateRule(id, dto);
  }

  @Delete('rules/:id')
  @RequirePermissions(P.MASTER_MANAGE)
  deleteRule(@Param('id') id: string) {
    return this.master.deleteRule(id);
  }

  @Post('seed')
  @RequirePermissions(P.MASTER_MANAGE)
  seed() {
    return this.master.seedDefaults();
  }
}
