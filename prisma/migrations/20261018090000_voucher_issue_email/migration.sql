-- Per-campaign switch: email opted-in members when they are issued this voucher.
ALTER TABLE "voucher_campaigns" ADD COLUMN "email_on_issue" BOOLEAN NOT NULL DEFAULT false;

-- Per-voucher "you've got a voucher" email state (null = no email).
ALTER TABLE "vouchers" ADD COLUMN "issue_email_status" VARCHAR(16);
ALTER TABLE "vouchers" ADD COLUMN "issue_email_at" TIMESTAMP(3);
CREATE INDEX "vouchers_issue_email_status_idx" ON "vouchers"("issue_email_status");
