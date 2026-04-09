import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminBootstrapDto } from './dto/admin-bootstrap.dto';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import type { AdminAuthState } from './types/admin-auth.types';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('bootstrap')
  bootstrap(@Body() dto: AdminBootstrapDto) {
    return this.auth.bootstrap(dto);
  }

  @Post('login')
  login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      undefined;
    return this.auth.login(dto, ip);
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  me(@CurrentAdmin() admin: AdminAuthState) {
    return this.auth.me(admin);
  }
}
