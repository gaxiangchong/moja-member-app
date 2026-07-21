import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export type SalesChannel = 'pos' | 'online_shop' | 'bento';

export class UnifiedTransactionsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['pos', 'online_shop', 'bento'])
  channel?: SalesChannel;

  /** Matches the transaction payment method (POS payment types, or "online"). */
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  /** Inclusive lower bound on transaction amount, in cents. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minAmountCents?: number;

  /** Inclusive upper bound on transaction amount, in cents. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxAmountCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';
}
