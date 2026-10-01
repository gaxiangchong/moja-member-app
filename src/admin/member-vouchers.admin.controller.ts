import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentAdmin } from '../admin-auth/decorators/current-admin.decorator';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { P } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import {
  IssueMemberVoucherDto,
  RevokeMemberVoucherDto,
  UpdateMemberVoucherDto,
} from './dto/member-voucher.dto';
import { MemberVouchersAdminService } from './member-vouchers.admin.service';

/**
 * A member's campaign vouchers, for correcting one that was sent by mistake:
 * change its expiry or name, withdraw it, bring it back, or send another.
 * Every change is recorded in the audit log.
 */
@Controller('admin/customers/:id/campaign-vouchers')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class MemberVouchersAdminController {
  constructor(private readonly vouchers: MemberVouchersAdminService) {}

  @Get()
  @RequirePermissions(P.VOUCHER_READ)
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.vouchers.list(id);
  }

  @Post()
  @RequirePermissions(P.VOUCHER_ASSIGN)
  issue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueMemberVoucherDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.vouchers.issue(id, dto, auth);
  }

  @Patch(':voucherId')
  @RequirePermissions(P.VOUCHER_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('voucherId', ParseUUIDPipe) voucherId: string,
    @Body() dto: UpdateMemberVoucherDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.vouchers.update(id, voucherId, dto, auth);
  }

  @Post(':voucherId/revoke')
  @RequirePermissions(P.VOUCHER_REVOKE)
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('voucherId', ParseUUIDPipe) voucherId: string,
    @Body() dto: RevokeMemberVoucherDto,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    return this.vouchers.revoke(id, voucherId, dto, auth);
  }
}
