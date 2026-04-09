import { AdminRoleCode } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
