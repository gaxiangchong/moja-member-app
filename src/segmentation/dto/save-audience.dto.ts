import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SegmentFiltersDto } from './segment-filters.dto';

export class SaveAudienceDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ValidateNested()
  @Type(() => SegmentFiltersDto)
  filters!: SegmentFiltersDto;
}
