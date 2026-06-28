import { BentoPackageCode } from '@prisma/client';
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
  ValidateNested,
  ValidateIf,
} from 'class-validator';

export class UpdateBentoPackageItemDto {
  @IsEnum(BentoPackageCode)
  code!: BentoPackageCode;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(1_000_000)
  pricePerMealCents?: number;

  /** Set to null to clear fixed checkout (use per-meal pricing only). */
  @IsOptional()
  @ValidateIf((_o, value) => value != null)
  @IsInt()
  @Min(100)
  @Max(10_000_000)
  fixedCheckoutCents?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBentoPackagesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateBentoPackageItemDto)
  packages!: UpdateBentoPackageItemDto[];
}
