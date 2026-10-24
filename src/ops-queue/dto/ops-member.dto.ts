import {
  IsBoolean,
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class OpsMemberLookupDto {
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;

  /** Employee code of the staff member at the counter, for the audit trail. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  staffCode?: string;
}

/**
 * Counter registration. Kept short — there is a queue behind the customer.
 * Phone and email are required; the rest can be filled in later by the member
 * themselves or by an admin.
 */
export class OpsCreateMemberDto {
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  /** Needed for forgot-PIN recovery (and voucher emails), so always asked for. */
  @IsEmail()
  @MaxLength(200)
  email!: string;

  /**
   * Typed by the customer themselves on the counter device, never by staff.
   * Optional: left blank, the member sets it later in the app. Only used for a
   * member who has no PIN yet; never stored in plain text or logged.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN must be 6 digits' })
  pin?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN confirmation must be 6 digits' })
  pinConfirm?: string;

  @IsOptional()
  @IsISO8601()
  birthday?: string;

  /**
   * The customer agreed to receive promotions. The counter form pre-ticks it
   * at the shop's request; staff untick it when the customer says no.
   */
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  staffCode?: string;
}
