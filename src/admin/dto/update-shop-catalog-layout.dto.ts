import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ShopCatalogSectionDto {
  @IsString()
  @MaxLength(64)
  id!: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  productIds!: string[];
}

export class UpdateShopCatalogLayoutDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  homeFeaturedProductIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ShopCatalogSectionDto)
  shopSections?: ShopCatalogSectionDto[];
}
