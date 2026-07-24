import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ShopCatalogVariantDto } from './shop-catalog-variant.dto';

const SHOP_CATEGORIES = [
  'whole_cakes',
  'cake_slices',
  'drinks',
  'specials',
] as const;

export class CreateShopCatalogProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsIn([...SHOP_CATEGORIES])
  category!: (typeof SHOP_CATEGORIES)[number];

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(500)
  shortDescription!: string;

  @IsString()
  @MaxLength(4000)
  description!: string;

  @IsString()
  @MaxLength(2000)
  imageUrl!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  imageOffsetX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  imageOffsetY?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(3)
  imageScale?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  basePriceCents!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  categoryLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  priceDisplay?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  badge?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  soldOut?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShopCatalogVariantDto)
  variants?: ShopCatalogVariantDto[];

  /** SalesPlay POS product code for this product (empty string clears it). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  salesplayProductCode?: string;

  /** SalesPlay product code per variant, keyed by variant label. */
  @IsOptional()
  @IsObject()
  salesplayVariantCodes?: Record<string, string>;
}
