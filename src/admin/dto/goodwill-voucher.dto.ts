import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class GoodwillVoucherDto {
  @IsString()
  @MaxLength(64)
  voucherCode!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
