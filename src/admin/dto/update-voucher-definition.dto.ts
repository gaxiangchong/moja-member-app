import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateVoucherDefinitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pointsCost?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  rewardCategory?: string | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  showInRewardsCatalog?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  rewardSortOrder?: number;

  @IsOptional()
  @IsDateString()
  rewardValidFrom?: string | null;

  @IsOptional()
  @IsDateString()
  rewardValidUntil?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxTotalIssued?: number | null;
}
