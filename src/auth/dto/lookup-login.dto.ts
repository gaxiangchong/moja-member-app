import { IsString, MinLength } from 'class-validator';

export class LookupLoginDto {
  @IsString()
  @MinLength(5)
  phone!: string;
}
