import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  OpsAttachReceiptDto,
  OpsRedeemDto,
  OpsUndoRedemptionDto,
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
