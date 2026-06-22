import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BentoRefundDto {
  @IsString()
  @MaxLength(300)
  reason!: string;

  /** Free-text note on how the manual/offline payout was made (optional). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  payoutNote?: string;
}
