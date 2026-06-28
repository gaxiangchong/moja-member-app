import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { SitesCatalog } from '../../shop-catalog/sites-catalog.types';

export class SyncShopCatalogFromSitesDto {
  /** When set, use this catalog JSON instead of MOJA_SITES_CATALOG_PATH / URL. */
  @IsOptional()
  @IsObject()
  catalog?: SitesCatalog;

  @IsOptional()
  @IsIn(['pricing_and_media', 'full'])
  mode?: 'pricing_and_media' | 'full';

  /** Add products present in moja-sites but missing from the member catalog. Default true. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  createMissing?: boolean;

  /** Also sync home featured + shop sections from moja-sites. Default false. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  syncLayout?: boolean;

  /** Write merged products back to config/ seed files (for git). Default false. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  writeSeedConfig?: boolean;
}

export class PreviewShopCatalogSyncDto extends SyncShopCatalogFromSitesDto {}
