import { IsOptional, IsString, Matches } from 'class-validator';

export class AvailabilityQueryDto {
  /** Collection day (yyyy-mm-dd, shop timezone). Defaults to today. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be yyyy-mm-dd' })
  date?: string;

  /** Comma-separated product categories in the cart, e.g. "whole_cakes,drinks". */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_,]{0,200}$/, {
    message: 'categories must be a comma-separated list',
  })
  categories?: string;
}
