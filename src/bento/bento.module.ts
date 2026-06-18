import { Module } from '@nestjs/common';
import { JwtAccessModule } from '../auth/jwt-access.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BentoController } from './bento.controller';
import { BentoService } from './bento.service';
import { BentoMenuModule } from './bento-menu.module';
import { ReportingSettingsModule } from '../admin/reporting-settings.module';

@Module({
  imports: [PrismaModule, JwtAccessModule, PaymentsModule, BentoMenuModule, ReportingSettingsModule],
  controllers: [BentoController],
  providers: [BentoService],
  exports: [BentoService],
})
export class BentoModule {}
