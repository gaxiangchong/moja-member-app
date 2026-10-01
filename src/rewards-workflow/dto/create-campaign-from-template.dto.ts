import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CampaignTemplate, VoucherOrderType, VoucherType } from '@prisma/client';

export class CampaignTriggerDto {
  @IsEnum(['AUTO', 'MANUAL', 'POINTS_REDEEM'] as const)
  type!: 'AUTO' | 'MANUAL' | 'POINTS_REDEEM';

  @IsOptional()
  @IsEnum([
    'NEW_MEMBER',
    'BIRTHDAY',
    'REFERRAL_PURCHASE',
    'REFERRAL_COUNT',
    'INACTIVE_DAYS',
    'MIN_PURCHASE',
    'ALL_MEMBERS',
    'WALLET_TOPUP',
  ] as const)
  criteria?:
    | 'NEW_MEMBER'
    | 'BIRTHDAY'
    | 'REFERRAL_PURCHASE'
    | 'REFERRAL_COUNT'
    | 'INACTIVE_DAYS'
    | 'MIN_PURCHASE'
    | 'ALL_MEMBERS'
    | 'WALLET_TOPUP';

  @IsOptional()
  @IsNumber()
  @Min(0)
  thresholdValue?: number;
}

export class CreateCampaignFromTemplateDto {
  @IsEnum(CampaignTemplate)
  template!: CampaignTemplate;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(VoucherType)
  voucherType!: VoucherType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmountRM?: number;

  @IsOptional()
  @IsString()
  freeItemSku?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  walletCreditRM?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minSpendRM?: number;

  /**
   * REFERRAL_PURCHASE: the referred friend's first paid order must be at least
   * this many RM for the referrer to earn the voucher. Omit to use the
   * template default (RM30); 0 means no minimum.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  qualifyingMinSpendRM?: number;

  @ValidateNested()
  @Type(() => CampaignTriggerDto)
  trigger!: CampaignTriggerDto;

  @IsDateString()
  startsAt!: string;

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
  @IsInt()
  @Min(0)
  pointsCost?: number;
}
