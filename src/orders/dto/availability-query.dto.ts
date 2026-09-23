import { IsOptional, IsString, Matches } from 'class-validator';

export class AvailabilityQueryDto {
  /** Collection day (yyyy-mm-dd, shop timezone). Defaults to today. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be yyyy-mm-dd' })
  date?: string;
}
