import { ExportFormat, ExportJobKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { SegmentFiltersDto } from '../../segmentation/dto/segment-filters.dto';

export class ExportRequestDto {
  @IsEnum(ExportJobKind)
  kind!: ExportJobKind;

  @IsEnum(ExportFormat)
  format!: ExportFormat;

  @IsOptional()
  @IsBoolean()
  maskSensitive?: boolean;

  @IsOptional()
  @IsUUID()
  audienceId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentFiltersDto)
  segmentFilters?: SegmentFiltersDto;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}
