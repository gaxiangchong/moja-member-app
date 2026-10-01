import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentAdmin } from '../admin-auth/decorators/current-admin.decorator';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { auditActorBase } from '../admin-auth/audit-context.util';
import { P } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { AuditService } from '../audit/audit.service';
import { WalletTopUpSettingsService } from '../wallet/topup-settings.service';

/**
 * Credit top-ups: on/off, the allowed range, and the bonus tiers ("top up RM100,
 * get RM20 extra"). This decides how much free credit the shop gives away, so
 * every change is recorded in the audit log with the old and new offer.
 */
@Controller('admin/wallet/topup-settings')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class WalletTopUpSettingsAdminController {
  constructor(
    private readonly settings: WalletTopUpSettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(P.WALLET_READ)
  getSettings() {
    return this.settings.getSettings();
  }

  @Put()
  @RequirePermissions(P.WALLET_ADJUST)
  async setSettings(
    @Body() body: unknown,
    @CurrentAdmin() auth: AdminAuthState,
  ) {
    const before = await this.settings.getSettings();
    const after = await this.settings.setSettings(body);
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'wallet_topup_settings.updated',
      entityType: 'app_setting',
      beforeValue: before as unknown as object,
      afterValue: after as unknown as object,
    });
    return after;
  }
}
