import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

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

  @IsOptional()
  @IsEmail()
  email?: string;

  /**
   * Which app the signup came from, used to seed the member's product-interest
   * tag: 'bento' (bento app) or 'cake' (client/cake app). Ignored for existing
   * members.
   */
  @IsOptional()
  @IsIn(['bento', 'cake'])
  source?: 'bento' | 'cake';
}
