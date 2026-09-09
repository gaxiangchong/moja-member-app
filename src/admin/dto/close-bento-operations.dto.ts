import { IsString, Matches } from 'class-validator';

export class CloseBentoOperationsDto {
  /** Last bookable pickup date (YYYY-MM-DD). Everything after it is blocked. */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be YYYY-MM-DD',
  })
  date!: string;
}
