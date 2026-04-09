import { WalletTxnType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminWalletAdjustmentDto {
  @IsEnum(WalletTxnType)
  type!: WalletTxnType;

  @IsInt()
  amountCents!: number;

  @IsString()
  @MaxLength(300)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  campaignCode?: string;
}
