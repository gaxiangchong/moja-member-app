import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateBentoSettingsDto {
  @IsInt()
  @Min(1)
  @Max(10_000)
  dailyCapacityPacks!: number;

  @IsOptional()
  @IsBoolean()
  blockNewOrders?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'earliestPickupDate must be YYYY-MM-DD',
  })
  earliestPickupDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  minScheduleLeadDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  scheduleCutoffHour?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  closedDates?: string[];
}
