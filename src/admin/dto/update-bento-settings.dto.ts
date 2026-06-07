import { IsInt, Max, Min, IsBoolean, IsOptional } from 'class-validator';

export class UpdateBentoSettingsDto {
  @IsInt()
  @Min(1)
  @Max(10_000)
  dailyCapacityPacks!: number;

  @IsOptional()
  @IsBoolean()
  blockNewOrders?: boolean;
}
