import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { VoucherOrderType } from '@prisma/client';

const AUTO_CREDIT_TRIGGERS = [
  'NEW_MEMBER',
  'BIRTHDAY',
  'REFERRAL_COUNT',
  'INACTIVE_DAYS',
  'MIN_PURCHASE',
] as const;

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmountRM?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minSpendRM?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  voucherValidDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTotalIssued?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimitPerUser?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableOutlets?: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(VoucherOrderType, { each: true })
  applicableOrderTypes?: VoucherOrderType[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableCategories?: string[];

  @IsOptional()
  @IsBoolean()
  allowStacking?: boolean;

  @IsOptional()
  @IsString()
  tncText?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  visibleInWallet?: boolean;

  /** Empty string clears the automatic trigger (manual issue only). */
  @IsOptional()
  @IsIn([...AUTO_CREDIT_TRIGGERS, ''])
  autoCreditTrigger?: string;

  /** Meaning depends on autoCreditTrigger: referral count, days inactive, or
   *  RM spend threshold (converted to sen server-side) for MIN_PURCHASE. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  autoCreditThresholdValue?: number;
}
