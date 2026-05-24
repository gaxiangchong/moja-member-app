import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

class GiftCodeRowDto {
  @IsString()
  @MaxLength(128)
  code!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  campaignCode?: string;
}

export class AdminImportGiftCodesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GiftCodeRowDto)
  rows!: GiftCodeRowDto[];
}
