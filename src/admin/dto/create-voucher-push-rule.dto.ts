import { VoucherPushTriggerType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateVoucherPushRuleDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsEnum(VoucherPushTriggerType)
  triggerType!: VoucherPushTriggerType;

  @IsObject()
  triggerConfig!: Record<string, unknown>;

  @IsUUID()
  voucherDefinitionId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxGrantsPerCustomer?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cooldownDays?: number;
}
