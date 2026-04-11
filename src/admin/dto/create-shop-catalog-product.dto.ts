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
}
