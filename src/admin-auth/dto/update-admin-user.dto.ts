import { AdminRoleCode } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateAdminUserDto {
  @IsOptional()
  @IsEnum(AdminRoleCode)
  role?: AdminRoleCode;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  /**
   * Reset this admin's password. Super-admin only (the route already requires
   * ADMIN_MANAGE). Sets passwordChangedAt, which invalidates their existing
   * sessions. An admin changing their own password should use
   * POST /admin/auth/password instead, which verifies the current one.
   */
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password?: string;
}
