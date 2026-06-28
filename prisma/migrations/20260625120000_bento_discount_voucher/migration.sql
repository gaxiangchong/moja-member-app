-- CreateEnum
CREATE TYPE "BentoDiscountRedemptionStatus" AS ENUM ('RESERVED', 'CONFIRMED', 'RELEASED');

-- CreateTable
CREATE TABLE "bento_discount_vouchers" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "amount_off_cents" INTEGER NOT NULL,
    "min_spend_cents" INTEGER,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "redemption_cap" INTEGER NOT NULL,
    "redeemed_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bento_discount_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bento_discount_redemptions" (
    "id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "payment_intent_id" UUID,
    "discount_cents" INTEGER NOT NULL,
    "status" "BentoDiscountRedemptionStatus" NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),

    CONSTRAINT "bento_discount_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bento_discount_vouchers_code_key" ON "bento_discount_vouchers"("code");

-- CreateIndex
CREATE INDEX "bento_discount_vouchers_is_active_starts_at_ends_at_idx" ON "bento_discount_vouchers"("is_active", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "bento_discount_redemptions_voucher_id_status_idx" ON "bento_discount_redemptions"("voucher_id", "status");

-- CreateIndex
CREATE INDEX "bento_discount_redemptions_payment_intent_id_idx" ON "bento_discount_redemptions"("payment_intent_id");

-- AddForeignKey
ALTER TABLE "bento_discount_redemptions" ADD CONSTRAINT "bento_discount_redemptions_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "bento_discount_vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bento_discount_redemptions" ADD CONSTRAINT "bento_discount_redemptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
