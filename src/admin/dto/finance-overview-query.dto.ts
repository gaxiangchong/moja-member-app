import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class FinanceOverviewQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  bucket?: 'day' | 'week' | 'month';
}
