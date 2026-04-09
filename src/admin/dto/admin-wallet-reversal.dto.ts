import { IsString, MaxLength } from 'class-validator';

export class AdminWalletReversalDto {
  @IsString()
  @MaxLength(300)
  reason!: string;
}
