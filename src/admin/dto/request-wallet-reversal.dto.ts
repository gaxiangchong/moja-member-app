import { IsString, IsUUID, MaxLength } from 'class-validator';

export class RequestWalletReversalDto {
  @IsUUID()
  transactionId!: string;

  @IsString()
  @MaxLength(2000)
  reason!: string;
}
