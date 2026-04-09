import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RevokeCustomerVoucherDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
