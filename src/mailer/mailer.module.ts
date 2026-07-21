import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminMailerController } from './admin-mailer.controller';
import { MailerPublicController } from './mailer-public.controller';
import { MailerService } from './mailer.service';

@Module({
  imports: [ConfigModule, PrismaModule, AdminAuthModule, NotificationsModule],
  controllers: [AdminMailerController, MailerPublicController],
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
