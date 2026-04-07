import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateVoucherDefinitionDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  pointsCost?: number;
}
