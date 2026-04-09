import { IsIn, IsInt, Min } from 'class-validator';

export class WalletTopUpDto {
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsIn(['online', 'cashier'])
  channel!: 'online' | 'cashier';
}
