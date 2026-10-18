import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class OpsRedeemDto {
  /** The member's phone number — read from their QR or typed by the cashier. */
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;

  @IsUUID()
  rewardId!: string;

  /** Employee code of the cashier. Required: every redemption is attributed. */
  @IsString()
  @MaxLength(32)
  staffCode!: string;

  /** One per tap, so a double tap or a retry can never charge twice. */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;

  /** How the cashier identified the member. */
  @IsIn(['QR', 'PHONE'])
  verification!: 'QR' | 'PHONE';
}

export class OpsUndoRedemptionDto {
  @IsString()
  @MaxLength(32)
  staffCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class OpsAttachReceiptDto {
  @IsString()
  @MaxLength(32)
  staffCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  receiptRef!: string;
}

/** The vouchers a member holds, for the member desk. */
export class OpsMemberVouchersDto {
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;
}

/** A cashier uses one of the member's vouchers at the till. */
export class OpsUseVoucherDto {
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;

  @IsUUID()
  voucherId!: string;

  /** CAMPAIGN = voucher campaigns (welcome, birthday, …); CATALOG = older series vouchers. */
  @IsIn(['CATALOG', 'CAMPAIGN'])
  source!: 'CATALOG' | 'CAMPAIGN';

  /** Employee code of the cashier. Required: every use is attributed. */
  @IsString()
  @MaxLength(32)
  staffCode!: string;

  @IsIn(['QR', 'PHONE'])
  verification!: 'QR' | 'PHONE';
}
