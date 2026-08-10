import { IsInt, IsString, Min, MaxLength, MinLength } from 'class-validator';

export class AdminBackfillLoyaltyDto {
  @IsInt()
  @Min(1)
  deltaPoints!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  adminPassword!: string;
}
