import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { EmailOtpService } from '../auth/email-otp.service';
import { SmsOtpService } from '../auth/sms-otp.service';
import { TwilioVerifyService } from '../auth/twilio-verify.service';
import { WhatsappOtpService } from '../auth/whatsapp-otp.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReadinessController } from './readiness.controller';
import { ReadinessService } from './readiness.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AdminAuthModule,
    PaymentsModule,
    NotificationsModule,
  ],
  controllers: [ReadinessController],
  // OTP channel services are instantiated here for their `isConfigured()`
  // checks. WhatsApp OTP delegates to WhatsappMessagingService, which comes
  // from NotificationsModule.
  providers: [
    ReadinessService,
    WhatsappOtpService,
    SmsOtpService,
    TwilioVerifyService,
    EmailOtpService,
  ],
})
export class ReadinessModule {}
