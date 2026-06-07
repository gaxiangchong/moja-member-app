import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { BentoService } from './bento.service';
import {
  BentoCheckoutDto,
  BentoQuoteDto,
  BentoScheduleDto,
  BentoWeeklyOptInDto,
} from './dto/bento-subscription.dto';

@Controller('bento')
export class BentoController {
  constructor(private readonly bento: BentoService) {}

  @Get('packages')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  listPackages(@CurrentUser() user: AuthUser) {
    return this.bento.listPackages(user.customerId);
  }

  @Get('menu')
  getMenu() {
    return this.bento.getMenu();
  }

  @Get('weekly-menu')
  getWeeklyMenu() {
    return this.bento.getWeeklyMenu();
  }

  @Get('schedule-capacity')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getScheduleCapacity(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.bento.getScheduleCapacity(from, to);
  }

  @Get('weekly-opt-in')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getWeeklyOptIn(@CurrentUser() user: AuthUser) {
    return this.bento.getWeeklyOptInStatus(user.customerId);
  }

  @Post('weekly-opt-in')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  setWeeklyOptIn(
    @CurrentUser() user: AuthUser,
    @Body() dto: BentoWeeklyOptInDto,
  ) {
    return this.bento.setWeeklyOptIn(user.customerId, dto);
  }

  @Post('subscriptions/quote')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  quote(@CurrentUser() user: AuthUser, @Body() dto: BentoQuoteDto) {
    return this.bento.quote(user.customerId, dto);
  }

  @Post('subscriptions/:id/schedule')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  schedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: BentoScheduleDto,
  ) {
    return this.bento.scheduleDeliveries(user.customerId, id, dto);
  }

  @Post('subscriptions/checkout')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  checkout(@CurrentUser() user: AuthUser, @Body() dto: BentoCheckoutDto) {
    return this.bento.checkout(user.customerId, dto);
  }

  @Get('subscriptions/me')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  listMine(@CurrentUser() user: AuthUser) {
    return this.bento.listMySubscriptions(user.customerId);
  }

  @Get('subscriptions/:id')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bento.getSubscription(user.customerId, id);
  }
}
