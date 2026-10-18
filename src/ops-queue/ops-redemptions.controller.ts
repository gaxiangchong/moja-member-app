import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  OpsAttachReceiptDto,
  OpsMemberVouchersDto,
  OpsRedeemDto,
  OpsUndoRedemptionDto,
  OpsUseVoucherDto,
} from './dto/ops-redemption.dto';
import { OpsApiKeyGuard } from './guards/ops-api-key.guard';
import { OpsRedemptionsService } from './ops-redemptions.service';

/**
 * Counter redemptions: a cashier redeems a member's points for a discount that
 * they then key into the till. POST for the member-facing calls so phone numbers
 * stay out of URLs and logs.
 */
@Controller('ops/redemptions')
@UseGuards(OpsApiKeyGuard)
export class OpsRedemptionsController {
  constructor(private readonly redemptions: OpsRedemptionsService) {}

  @Get('rewards')
  rewards() {
    return this.redemptions.listRewards();
  }

  @Get('today')
  today() {
    return this.redemptions.listToday();
  }

  @Post()
  redeem(@Body() dto: OpsRedeemDto, @Ip() ip: string) {
    return this.redemptions.redeem(dto, ip);
  }

  /** The member's own vouchers (welcome, birthday, …) that can be used now. */
  @Post('member-vouchers')
  @HttpCode(200)
  memberVouchers(@Body() dto: OpsMemberVouchersDto) {
    return this.redemptions.listMemberVouchers(dto);
  }

  /** Use one of those vouchers at the till; it is marked used straight away. */
  @Post('member-vouchers/use')
  @HttpCode(200)
  useMemberVoucher(@Body() dto: OpsUseVoucherDto, @Ip() ip: string) {
    return this.redemptions.useMemberVoucher(dto, ip);
  }

  @Post(':id/undo')
  undo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OpsUndoRedemptionDto,
    @Ip() ip: string,
  ) {
    return this.redemptions.undo(id, dto, ip);
  }

  @Patch(':id/receipt')
  receipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OpsAttachReceiptDto,
  ) {
    return this.redemptions.attachReceipt(id, dto);
  }
}
