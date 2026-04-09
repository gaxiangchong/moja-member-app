import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { AdminPermissionsGuard } from './guards/admin-permissions.guard';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('ADMIN_JWT_SECRET') ||
          config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<number>(
            'ADMIN_JWT_EXPIRES_IN_SEC',
            config.get<number>('JWT_EXPIRES_IN_SEC', 604800) ?? 604800,
          ),
        },
      }),
    }),
  ],
  controllers: [AdminAuthController, AdminUsersController],
  providers: [AdminAuthService, AdminAuthGuard, AdminPermissionsGuard],
  exports: [AdminAuthService, AdminAuthGuard, AdminPermissionsGuard, JwtModule],
})
export class AdminAuthModule {}
