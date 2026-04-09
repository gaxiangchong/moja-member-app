import { AdminRoleCode } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAdminUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10)
  password!: string;

  @IsEnum(AdminRoleCode)
  role!: AdminRoleCode;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}
