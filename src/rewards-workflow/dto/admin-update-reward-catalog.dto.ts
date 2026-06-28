import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class AdminUpdateRewardCatalogDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  pointsCost?: number;

  @IsOptional()
  @IsUUID()
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
