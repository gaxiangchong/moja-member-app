import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** One admin-chosen mapping of a SalesPlay code onto a catalog product/variant. */
export class SalesplaySyncAssignmentDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(200)
  productId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  variantLabel?: string | null;
}

export class SyncShopCatalogFromSalesplayDto {
  /** Raw CSV to diff against. Omit to reuse the copy stored on the server. */
  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  csv?: string;

  /** SalesPlay categories to consider. Empty = everything except delivery / GrabFood / bento / OTHER. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  /** Write the SalesPlay code onto every matched product/variant. Default true. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  updateCodes?: boolean;

  /** Copy SalesPlay prices onto matched products (skips prices edited by hand). Default false. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  updatePrices?: boolean;

  /** Create catalog products for SalesPlay products the app does not have. Default false. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  createMissingProducts?: boolean;

  /** Add missing sizes to catalog products that already exist. Default false. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  createMissingVariants?: boolean;

  /** Hide catalog products SalesPlay no longer sells. Default false. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  deactivateMissing?: boolean;

  /** Manual mappings for rows the matcher could not place on its own. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesplaySyncAssignmentDto)
  assignments?: SalesplaySyncAssignmentDto[];
}

export class PreviewShopCatalogSalesplaySyncDto extends SyncShopCatalogFromSalesplayDto {}
