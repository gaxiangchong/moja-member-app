import { IsString, MaxLength, MinLength } from 'class-validator';

export class RedeemGiftCodeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(128)
  code!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;
}
