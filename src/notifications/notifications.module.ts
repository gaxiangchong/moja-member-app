import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailService } from './email.service';
import { OrderNotificationService } from './order-notification.service';
import { ReceiptEmailService } from './receipt-email.service';
import { WhatsappMessagingService } from './whatsapp-messaging.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    EmailService,
    ReceiptEmailService,
    WhatsappMessagingService,
    OrderNotificationService,
  ],
  exports: [
    EmailService,
    ReceiptEmailService,
    WhatsappMessagingService,
    OrderNotificationService,
  ],
})
export class NotificationsModule {}
