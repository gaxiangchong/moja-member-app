import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class StockDayGridQueryDto {
  /** First day of the grid (yyyy-mm-dd, shop timezone). Defaults to today. */
  @IsOptional()
  @IsString()
  @Matches(YMD, { message: 'from must be yyyy-mm-dd' })
  from?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  days?: number;
}

export class SetStockDayDto {
  @IsString()
  productId!: string;

  @IsString()
  @Matches(YMD, { message: 'businessDate must be yyyy-mm-dd' })
  businessDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  qty!: number;
}
