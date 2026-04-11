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

export class CreateVoucherDefinitionDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  pointsCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  rewardCategory?: string;

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
  rewardValidFrom?: string;

  @IsOptional()
  @IsDateString()
  rewardValidUntil?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxTotalIssued?: number;
}
