import { CustomerStatus, VoucherStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Filters for segment preview, export, and saved audiences (stored as JSON). */
export class SegmentFiltersDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  memberTier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  signupSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  preferredStore?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagsAny?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagsAll?: string[];

  @IsOptional()
  @IsString()
  signupFrom?: string;

  @IsOptional()
  @IsString()
  signupTo?: string;

  @IsOptional()
  @IsString()
  lastLoginFrom?: string;

  @IsOptional()
  @IsString()
  lastLoginTo?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  neverLoggedIn?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  inactiveDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  birthdayMonth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  birthdayDay?: number;

  @IsOptional()
  @IsEnum(VoucherStatus)
  voucherStatus?: VoucherStatus;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hasAnyVoucher?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minPoints?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxPoints?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minWalletCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxWalletCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minLifetimeSpendCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxLifetimeSpendCents?: number;
}
