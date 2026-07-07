import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
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
