import { IsDateString, IsOptional, IsString } from 'class-validator';

// campaignId and customerId are URL path params, not body fields.
export class IssueVoucherToCustomerDto {
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
