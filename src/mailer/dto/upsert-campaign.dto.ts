import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EmailAudienceKind, EmailTemplateKind } from '@prisma/client';

export class CreateCampaignDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsEnum(EmailTemplateKind)
  templateKind?: EmailTemplateKind;

  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  preheader?: string | null;

  @IsString()
  @MaxLength(100_000)
  bodyHtml!: string;

  @IsOptional()
  @IsEnum(EmailAudienceKind)
  audience?: EmailAudienceKind;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tierFilter?: string | null;

  /** BIRTHDAY_UPCOMING audience: birthday within this many days (default 14). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  birthdayWindowDays?: number | null;

  /** Voucher series issued to every recipient when the campaign sends. */
  @IsOptional()
  @IsUUID()
  voucherDefinitionId?: string | null;

  /** Days the issued voucher stays valid (omit for no expiry). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  voucherValidDays?: number | null;
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(EmailTemplateKind)
  templateKind?: EmailTemplateKind;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  preheader?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  bodyHtml?: string;

  @IsOptional()
  @IsEnum(EmailAudienceKind)
  audience?: EmailAudienceKind;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tierFilter?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  birthdayWindowDays?: number | null;

  @IsOptional()
  @IsUUID()
  voucherDefinitionId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  voucherValidDays?: number | null;
}

export class ScheduleCampaignDto {
  /** ISO datetime to send at; omit to send immediately. */
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}

export class TestSendDto {
  @IsString()
  @MaxLength(320)
  email!: string;
}
