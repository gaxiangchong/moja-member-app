import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ORDER_KINDS,
  ORDER_TABS,
  type OrderKind,
  type OrderTab,
} from '../commerce-orders.util';

export class AdminListOrdersQueryDto {
  @IsOptional()
  @IsIn(['placed', 'completed', 'all'])
  status?: 'placed' | 'completed' | 'all';

  /** Status tab on the Orders screen; wins over `status` when set. */
  @IsOptional()
  @IsIn(ORDER_TABS)
  tab?: OrderTab;

  /** How the order leaves the shop. */
  @IsOptional()
  @IsIn(ORDER_KINDS)
  kind?: OrderKind;

  /** Order number, customer name or phone, or product name. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /** Only this member's orders (the member profile panel). */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /** Inclusive start (ISO date or datetime). Applies to `dateField`. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive end when using date-only, or exclusive upper bound for full ISO. */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** `shop`: from/to are Kuala Lumpur days. Unset keeps UTC days (legacy dashboard). */
  @IsOptional()
  @IsIn(['shop'])
  dayZone?: 'shop';

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
  @IsIn([
    'placed_desc',
    'placed_asc',
    'total_desc',
    'total_asc',
    'completed_desc',
    'completed_asc',
  ])
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

/** Period for the Orders screen's totals strip and tab counts. */
export class AdminOrdersSummaryQueryDto {
  /** Only this member's orders. */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(ORDER_KINDS)
  kind?: OrderKind;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
