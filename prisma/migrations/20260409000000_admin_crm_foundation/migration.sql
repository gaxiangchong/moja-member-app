-- Customer CRM fields
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "preferred_store" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "signup_source" TEXT NOT NULL DEFAULT 'otp';
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "member_tier" TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "marketing_consent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "customers_display_name_idx" ON "customers"("display_name");
CREATE INDEX IF NOT EXISTS "customers_email_idx" ON "customers"("email");
CREATE INDEX IF NOT EXISTS "customers_signup_source_idx" ON "customers"("signup_source");
CREATE INDEX IF NOT EXISTS "customers_member_tier_idx" ON "customers"("member_tier");

-- Voucher activity tracking
ALTER TABLE "customer_vouchers" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "customer_vouchers_updated_at_idx" ON "customer_vouchers"("updated_at");
