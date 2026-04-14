import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class WalletTopUpSessionDto {
  @IsInt()
  @Min(100)
  amountCents!: number;

  /** Overrides XENDIT_DEFAULT_CHANNEL_CODE (e.g. GCASH, TOUCHNGO). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  channelCode?: string;
}
