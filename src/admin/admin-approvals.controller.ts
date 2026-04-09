import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { ApprovalReviewDto } from './dto/approval-review.dto';
import { AdminAuthGuard } from '../admin-auth/guards/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin-auth/guards/admin-permissions.guard';
import { RequirePermissions } from '../admin-auth/decorators/require-permissions.decorator';
import { CurrentAdmin } from '../admin-auth/decorators/current-admin.decorator';
import { P } from '../admin-auth/permissions';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';

@Controller('admin/approvals')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('pending')
  @RequirePermissions(P.WALLET_REVERSAL_APPROVE)
  listPending() {
    return this.approvals.listPendingWalletReversals();
  }

  @Post(':id/approve')
  @RequirePermissions(P.WALLET_REVERSAL_APPROVE)
  approve(
    @Param('id') id: string,
    @CurrentAdmin() auth: AdminAuthState,
    @Body() body: ApprovalReviewDto,
  ) {
    return this.approvals.approveWalletReversal(id, auth, body.note);
  }

  @Post(':id/reject')
  @RequirePermissions(P.WALLET_REVERSAL_APPROVE)
  reject(
    @Param('id') id: string,
    @CurrentAdmin() auth: AdminAuthState,
    @Body() body: ApprovalReviewDto,
  ) {
    return this.approvals.rejectWalletReversal(id, auth, body.note);
  }
}
