import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RedeemGiftCodeDto } from './dto/redeem-gift-code.dto';
import { RedeemRewardDto } from './dto/redeem-reward.dto';
import { ValidateVoucherDto } from './dto/validate-voucher.dto';
import { RewardsWorkflowService } from './rewards-workflow.service';

@Controller('rewards-wallet')
@UseGuards(JwtAuthGuard)
export class RewardsWorkflowController {
  constructor(private readonly workflow: RewardsWorkflowService) {}

  @Get('me')
  myWallet(@CurrentUser() user: AuthUser) {
    return this.workflow.getMemberWalletAndRewards(user.customerId);
  }

  @Post('me/redeem-reward/:rewardCatalogId')
  redeemReward(
    @CurrentUser() user: AuthUser,
    @Param('rewardCatalogId') rewardCatalogId: string,
    @Body() dto: RedeemRewardDto,
  ) {
    return this.workflow.redeemRewardByPoints(
      user.customerId,
      rewardCatalogId,
      dto.idempotencyKey,
    );
  }

  @Post('me/redeem-gift-code')
  redeemGiftCode(@CurrentUser() user: AuthUser, @Body() dto: RedeemGiftCodeDto) {
    return this.workflow.redeemGiftVoucherCode(
      user.customerId,
      dto.code,
      dto.idempotencyKey,
    );
  }

  @Post('me/vouchers/validate-lock')
  validateAndLockVoucher(@CurrentUser() user: AuthUser, @Body() dto: ValidateVoucherDto) {
    return this.workflow.validateAndLockVoucher({
      customerId: user.customerId,
      voucherId: dto.voucherId,
      orderTotalCents: dto.orderTotalCents,
      orderType: dto.orderType,
      productIds: dto.productIds,
      categories: dto.categories,
      idempotencyKey: dto.idempotencyKey,
    });
  }
}
