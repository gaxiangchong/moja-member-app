import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ShopCatalogVariantDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  id?: string;

  @IsString()
  @MaxLength(80)
  label!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  priceDisplay?: string | null;
}
