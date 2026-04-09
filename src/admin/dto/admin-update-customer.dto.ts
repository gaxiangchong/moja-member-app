import { CustomerStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class AdminUpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsDateString()
  birthday?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  preferredStore?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  signupSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  memberTier?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  marketingConsent?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];

  /** Requires `ADMIN_ALLOW_PHONE_CHANGE=true` in environment. */
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'phoneE164 must be E.164 format, e.g. +6591234567',
  })
  phoneE164?: string;
}
