import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Correct a voucher a member was sent. Everything is optional; at least one change is required. */
export class UpdateMemberVoucherDto {
  /** A date (yyyy-mm-dd or ISO), or null for "never expires". */
  @IsOptional()
  expiresAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  reinstate?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class RevokeMemberVoucherDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class IssueMemberVoucherDto {
  @IsUUID()
  campaignId!: string;

  @IsOptional()
  expiresAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
