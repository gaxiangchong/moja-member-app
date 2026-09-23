import {
  IsBoolean,
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
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
 * Counter registration. Deliberately minimal — there is a queue behind the
 * customer. Everything except the phone number can be filled in later by the
 * member themselves or by an admin.
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

  /** Needed for forgot-PIN recovery later, so worth asking for. */
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsISO8601()
  birthday?: string;

  /**
   * Must be an explicit yes from the customer — never defaulted on. PDPA:
   * consent has to be actively given, not assumed.
   */
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  staffCode?: string;
}
