import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Admin activation of a stuck bento subscription. `reason` is required only when
 * Xendit cannot confirm the payment and staff force the activation manually.
 */
export class ActivateBentoSubscriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
