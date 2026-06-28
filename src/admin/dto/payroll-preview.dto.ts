import { IsDateString, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class PayrollPreviewDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  manualCommissionCents?: number;
}
