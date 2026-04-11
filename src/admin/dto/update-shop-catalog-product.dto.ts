import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const SHOP_CATEGORIES = [
  'whole_cakes',
  'cake_slices',
  'drinks',
  'specials',
] as const;

export class UpdateShopCatalogProductDto {
  @IsOptional()
  @IsIn([...SHOP_CATEGORIES])
  category?: (typeof SHOP_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  basePriceCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
