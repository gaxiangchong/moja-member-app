import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class AdminListOrdersQueryDto {
  @IsOptional()
  @IsIn(['placed', 'completed', 'all'])
  status?: 'placed' | 'completed' | 'all';

  /** Inclusive start (ISO date or datetime). Applies to `dateField`. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive end when using date-only, or exclusive upper bound for full ISO. */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Which timestamp the range filters on (default placed). */
  @IsOptional()
  @IsIn(['placed', 'completed'])
  dateField?: 'placed' | 'completed';

  @IsOptional()
  @IsString()
  productContains?: string;

  /** Exact product / SKU id on an order line (“favourite item” filter). */
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsIn(['placed_desc', 'placed_asc', 'total_desc', 'total_asc', 'completed_desc', 'completed_asc'])
  sort?:
    | 'placed_desc'
    | 'placed_asc'
    | 'total_desc'
    | 'total_asc'
    | 'completed_desc'
    | 'completed_asc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
