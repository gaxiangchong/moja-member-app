-- Delivery / contact address for member profile (bento + member apps).
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "address" TEXT;
