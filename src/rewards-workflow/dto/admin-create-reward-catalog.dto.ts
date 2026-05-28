import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { RewardType } from '@prisma/client';

export class AdminCreateRewardCatalogDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(RewardType)
  rewardType!: RewardType;

  @IsInt()
  @Min(0)
  pointsCost!: number;

  @IsOptional()
  @IsString()
  voucherCampaignId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  visibleInRewardsWallet?: boolean;

  @IsOptional()
  @IsString()
  tncText?: string;
}
