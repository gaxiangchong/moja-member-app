import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @MaxLength(64)
  employeeCode!: string;

  @IsString()
  @MaxLength(200)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  positionTitle?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  hourlyRateCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  commissionRateBps?: number;
}
