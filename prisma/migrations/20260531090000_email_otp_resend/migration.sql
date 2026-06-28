-- Add email/channel metadata for OTP workflows.
ALTER TABLE "otp_challenges"
ADD COLUMN "email" TEXT,
ADD COLUMN "delivery_channel" VARCHAR(20) NOT NULL DEFAULT 'dev';

ALTER TABLE "otp_request_logs"
ADD COLUMN "email" TEXT;

CREATE INDEX "otp_challenges_email_created_at_idx" ON "otp_challenges"("email", "created_at");
CREATE INDEX "otp_request_logs_email_created_at_idx" ON "otp_request_logs"("email", "created_at");
