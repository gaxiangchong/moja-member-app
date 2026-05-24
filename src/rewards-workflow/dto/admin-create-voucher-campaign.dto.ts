import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { VoucherOrderType, VoucherType } from '@prisma/client';

export class AdminCreateVoucherCampaignDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(VoucherType)
  voucherType!: VoucherType;

  @IsOptional()
  @IsInt()
  @Min(0)
  percentageOff?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  fixedAmountOff?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minSpend?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimitPerUser?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalRedemptionCap?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableProductIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableCategories?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableOutlets?: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(VoucherOrderType, { each: true })
  applicableOrderTypes?: VoucherOrderType[];

  @IsOptional()
  @IsString()
  autoCreditTrigger?: string;

  @IsOptional()
  @IsBoolean()
  visibleInWallet?: boolean;

  @IsOptional()
  @IsBoolean()
  allowStacking?: boolean;

  @IsOptional()
  @IsString()
  tncText?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
