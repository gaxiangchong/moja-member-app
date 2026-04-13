import { Body, Controller, Ip, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LookupLoginDto } from './dto/lookup-login.dto';
import { LoginPinDto } from './dto/login-pin.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthUser } from './types/auth-user.type';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login/lookup')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  loginLookup(@Body() dto: LookupLoginDto) {
    return this.auth.loginLookup(dto.phone);
  }

  @Post('otp/request')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  requestOtp(@Body() dto: RequestOtpDto, @Ip() ip: string) {
    return this.auth.requestOtp(dto.phone, ip, dto.purpose);
  }

  @Post('otp/verify')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code, dto.referralCode);
  }

  @Post('pin/set-initial')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  setInitialPin(@Body() dto: SetPinDto) {
    return this.auth.setPinFromSetup(dto.setupToken, dto.pin, dto.pinConfirm);
  }

  @Post('pin/login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 25, ttl: 60_000 } })
  loginWithPin(@Body() dto: LoginPinDto) {
    return this.auth.loginWithPin(dto.phone, dto.pin);
  }

  @Post('shop-handoff')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  shopHandoff(@CurrentUser() user: AuthUser) {
    return this.auth.issueShopHandoff(user.customerId);
  }
}
