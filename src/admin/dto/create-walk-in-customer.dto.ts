import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWalkInCustomerDto {
  @IsString()
  @MinLength(5)
  @MaxLength(20)
  phoneE164!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;
}
