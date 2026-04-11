import { IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @MinLength(5)
  phone!: string;

  @IsString()
  @Length(4, 8)
  code!: string;

  /** Optional referrer member code (from invite link). */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  referralCode?: string;
}
