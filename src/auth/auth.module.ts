import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessModule } from './jwt-access.module';
import { WhatsappOtpService } from './whatsapp-otp.service';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [ConfigModule, JwtAccessModule, CustomersModule],
  controllers: [AuthController],
  providers: [AuthService, WhatsappOtpService],
})
export class AuthModule {}
