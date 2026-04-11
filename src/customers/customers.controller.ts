import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CustomersService } from './customers.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { SubmitMemberOrderDto } from './dto/submit-member-order.dto';
import { WalletTopUpDto } from './dto/wallet-topup.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    return this.customers.getProfileBundle(user.customerId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.customers.updateMe(user.customerId, dto);
  }

  @Get('me/rewards')
  @UseGuards(JwtAuthGuard)
  async meRewards(@CurrentUser() user: AuthUser) {
    return this.customers.getMeRewards(user.customerId);
  }

  @Get('me/orders')
  @UseGuards(JwtAuthGuard)
  async listMyOrders(
    @CurrentUser() user: AuthUser,
    @Query('limit', new DefaultValuePipe(40), ParseIntPipe) limit: number,
  ) {
    return this.customers.listMemberOrders(user.customerId, limit);
  }

  @Post('me/orders')
  @UseGuards(JwtAuthGuard)
  async submitMyOrder(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitMemberOrderDto,
  ) {
    return this.customers.submitMemberOrder(user.customerId, dto);
  }

  @Get('me/wallet')
  @UseGuards(JwtAuthGuard)
  async meWallet(@CurrentUser() user: AuthUser) {
    return this.customers.getMeWallet(user.customerId);
  }

  @Patch('me/wallet/topup')
  @UseGuards(JwtAuthGuard)
  async meWalletTopUp(
    @CurrentUser() user: AuthUser,
    @Body() dto: WalletTopUpDto,
  ) {
    return this.customers.topUpMyWallet(user.customerId, dto);
  }
}
