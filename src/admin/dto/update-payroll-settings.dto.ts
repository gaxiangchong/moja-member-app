import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdatePayrollSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  standardWorkdayMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  overtimeMultiplierBps?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  publicHolidayMultiplierBps?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offDayWorkedMultiplierBps?: number;
}
