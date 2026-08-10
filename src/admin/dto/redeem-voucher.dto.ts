import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RedeemVoucherDto {
  @IsIn(['CATALOG', 'CAMPAIGN'])
  source: 'CATALOG' | 'CAMPAIGN';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
