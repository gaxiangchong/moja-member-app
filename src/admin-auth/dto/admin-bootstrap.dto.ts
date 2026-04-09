import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminBootstrapDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}
