import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePaymentsDemoModeDto {
  /**
   * `true`/`false` to force demo mode on/off; omit or pass `null` to clear
   * the override and defer back to the server's PAYMENTS_DEMO_MODE env var.
   */
  @IsOptional()
  @IsBoolean()
  enabled?: boolean | null;
}
