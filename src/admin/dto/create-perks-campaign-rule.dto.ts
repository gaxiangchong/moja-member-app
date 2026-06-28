import { PerksCriteriaKind, PerksProgramKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePerksCampaignRuleDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsEnum(PerksProgramKind)
  programKind!: PerksProgramKind;

  @IsEnum(PerksCriteriaKind)
  criteriaKind!: PerksCriteriaKind;

  @IsDateString()
  campaignStartDate!: string;

  @IsDateString()
  campaignEndDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPurchaseAmountSen?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rebateValueSen?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minWalletTopupSen?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  withinDaysOfSignup?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minReferralCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  inactiveDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  minMemberTier?: string;

  @IsUUID()
  voucherDefinitionId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxGrantsPerCustomer?: number;
}
