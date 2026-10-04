import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { MemberOrdersSettingsService } from '../orders/member-orders-settings.service';
import { CustomerAddressesService } from './customer-addresses.service';
import { CustomersService } from './customers.service';
import { MemberSavingsService } from './member-savings.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { WalletTopUpDto } from './dto/wallet-topup.dto';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly savings: MemberSavingsService,
    private readonly memberOrdersSettings: MemberOrdersSettingsService,
    private readonly addresses: CustomerAddressesService,
  ) {}

  /**
   * How much the member has saved with Moja so far, for the Orders page. Also
   * says how many days of past orders that page lists, so the app can say so.
   */
  @Get('me/savings')
  @UseGuards(JwtAuthGuard)
  async meSavings(@CurrentUser() user: AuthUser) {
    const [savings, settings] = await Promise.all([
      this.savings.getSavings(user.customerId),
      this.memberOrdersSettings.getSettings(),
    ]);
    return { ...savings, historyDays: settings.historyDays };
  }

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

  /** The member's saved delivery / shipping addresses, default first. */
  @Get('me/addresses')
  @UseGuards(JwtAuthGuard)
  listMyAddresses(@CurrentUser() user: AuthUser) {
    return this.addresses.list(user.customerId);
  }

  @Post('me/addresses')
  @UseGuards(JwtAuthGuard)
  addMyAddress(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.addresses.create(
      user.customerId,
      body,
      body?.isDefault === true,
    );
  }

  @Patch('me/addresses/:id')
  @UseGuards(JwtAuthGuard)
  updateMyAddress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.addresses.update(
      user.customerId,
      id,
      body,
      body?.isDefault === true,
    );
  }

  @Post('me/addresses/:id/default')
  @UseGuards(JwtAuthGuard)
  setMyDefaultAddress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.addresses.setDefault(user.customerId, id);
  }

  @Delete('me/addresses/:id')
  @UseGuards(JwtAuthGuard)
  deleteMyAddress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.addresses.remove(user.customerId, id);
  }

  @Get('me/rewards')
  @UseGuards(JwtAuthGuard)
  async meRewards(@CurrentUser() user: AuthUser) {
    return this.customers.getMeRewards(user.customerId);
  }

  @Get('me/loyalty-history')
  @UseGuards(JwtAuthGuard)
  async meLoyaltyHistory(
    @CurrentUser() user: AuthUser,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
  ) {
    return this.customers.getMyLoyaltyHistory(user.customerId, limit);
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
  async submitMyOrder() {
    throw new BadRequestException({
      code: 'ORDER_USE_SHOP_CHECKOUT',
      message:
        'Orders are placed from Shop checkout. Complete payment on the Xendit page (or test payment in demo mode).',
    });
  }

  @Post('me/orders/:id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelMyOrder(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customers.cancelMyOrder(user.customerId, id);
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
