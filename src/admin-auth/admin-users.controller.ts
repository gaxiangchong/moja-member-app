import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { AdminPermissionsGuard } from './guards/admin-permissions.guard';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import { P } from './permissions';
import type { AdminAuthState } from './types/admin-auth.types';

@Controller('admin/users')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminUsersController {
  constructor(private readonly auth: AdminAuthService) {}

  @Get()
  @RequirePermissions(P.ADMIN_MANAGE)
  list() {
    return this.auth.listUsers();
  }

  @Post()
  @RequirePermissions(P.ADMIN_MANAGE)
  create(
    @CurrentAdmin() actor: AdminAuthState,
    @Body() dto: CreateAdminUserDto,
  ) {
    return this.auth.createUser(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions(P.ADMIN_MANAGE)
  update(
    @CurrentAdmin() actor: AdminAuthState,
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.auth.updateUser(actor, id, dto);
  }
}
