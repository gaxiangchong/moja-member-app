-- Birthday email campaigns: new audience + optional voucher issued per recipient.
ALTER TYPE "EmailTemplateKind" ADD VALUE IF NOT EXISTS 'BIRTHDAY';
ALTER TYPE "EmailAudienceKind" ADD VALUE IF NOT EXISTS 'BIRTHDAY_UPCOMING';

ALTER TABLE "email_campaigns"
  ADD COLUMN "birthday_window_days" INTEGER,
  ADD COLUMN "voucher_definition_id" UUID,
  ADD COLUMN "voucher_valid_days" INTEGER;

ALTER TABLE "email_campaigns"
  ADD CONSTRAINT "email_campaigns_voucher_definition_id_fkey"
  FOREIGN KEY ("voucher_definition_id") REFERENCES "voucher_definitions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
