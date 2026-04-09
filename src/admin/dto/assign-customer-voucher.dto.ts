import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class AssignCustomerVoucherDto {
  @IsString()
  @MaxLength(64)
  voucherCode!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
