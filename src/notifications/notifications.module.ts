import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailService } from './email.service';
import { ReceiptEmailService } from './receipt-email.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [EmailService, ReceiptEmailService],
  exports: [EmailService, ReceiptEmailService],
})
export class NotificationsModule {}
