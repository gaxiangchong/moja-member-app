import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

export class UpdateReportingSettingsDto {
  /**
   * Sales reporting start date (YYYY-MM-DD). Pass null or an empty string to
   * clear the cutoff and show full history again.
   */
  @IsOptional()
  @ValidateIf(
    (o: UpdateReportingSettingsDto) =>
      o.salesStartDate !== null && o.salesStartDate !== '',
  )
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'salesStartDate must be YYYY-MM-DD, or null/empty to clear',
  })
  salesStartDate?: string | null;
}
