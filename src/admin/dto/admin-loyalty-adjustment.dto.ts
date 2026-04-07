import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class AdminLoyaltyAdjustmentDto {
  @IsInt()
  deltaPoints!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  referenceType?: string;

  @IsOptional()
  @IsUUID()
  referenceId?: string;
}
