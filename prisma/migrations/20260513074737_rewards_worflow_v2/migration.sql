/*
  Warnings:

  - A unique constraint covering the columns `[referral_code]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[idempotency_key]` on the table `payment_intents` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('FREE_ITEM', 'DISCOUNT_VOUCHER', 'LIMITED_TIME');

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_ITEM', 'DELIVERY_DISCOUNT', 'WALLET_TOPUP_CODE');

-- CreateEnum
CREATE TYPE "VoucherOrderType" AS ENUM ('PICKUP', 'DELIVERY', 'IN_STORE');

-- CreateEnum
CREATE TYPE "VoucherLifecycleStatus" AS ENUM ('ACTIVE', 'LOCKED', 'USED', 'EXPIRED', 'VOID');

-- CreateEnum
CREATE TYPE "UserRewardStatus" AS ENUM ('AVAILABLE', 'REDEEMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WalletTxnFlowType" AS ENUM ('TOPUP', 'SPEND', 'REFUND', 'GIFT_CODE_CREDIT', 'VOUCHER_CREDIT', 'MANUAL_ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "VoucherRedemptionStatus" AS ENUM ('LOCKED', 'CONFIRMED', 'RELEASED', 'EXPIRED');

-- AlterTable
ALTER TABLE "admin_users" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "business_rules" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "customer_order_lines" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "customer_orders" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "completed_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "customer_vouchers" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "daily_sales_closes" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "closed_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "employee_time_entries" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "master_entries" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payment_intents" ADD COLUMN     "idempotency_key" TEXT;

-- AlterTable
ALTER TABLE "perks_campaign_rules" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "segment_audiences" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "stored_wallets" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "work_calendar_days" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "user_wallet_balance" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "wallet_balance" INTEGER NOT NULL DEFAULT 0,
    "points_balance" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_wallet_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "user_wallet_balance_id" UUID,
    "type" "WalletTxnFlowType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_before" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "idempotency_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards_points_ledger" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "user_wallet_balance_id" UUID,
    "points_delta" INTEGER NOT NULL,
    "points_before" INTEGER NOT NULL,
    "points_after" INTEGER NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewards_points_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_catalog" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "reward_type" "RewardType" NOT NULL,
    "points_cost" INTEGER NOT NULL DEFAULT 0,
    "voucher_campaign_id" UUID,
    "visible_in_rewards_wallet" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "tnc_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_rewards" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "reward_catalog_id" UUID NOT NULL,
    "status" "UserRewardStatus" NOT NULL DEFAULT 'AVAILABLE',
    "redeemed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "voucher_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_campaigns" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "voucher_type" "VoucherType" NOT NULL,
    "percentage_off" INTEGER,
    "fixed_amount_off" INTEGER,
    "free_item_sku" TEXT,
    "delivery_discount_amount" INTEGER,
    "wallet_credit_amount" INTEGER,
    "min_spend" INTEGER,
    "expiry_date" TIMESTAMP(3),
    "one_time_use" BOOLEAN NOT NULL DEFAULT true,
    "one_voucher_per_txn" BOOLEAN NOT NULL DEFAULT true,
    "allow_stacking" BOOLEAN NOT NULL DEFAULT false,
    "usage_limit_per_user" INTEGER,
    "total_redemption_cap" INTEGER,
    "applicable_product_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicable_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicable_outlets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicable_order_types" "VoucherOrderType"[] DEFAULT ARRAY[]::"VoucherOrderType"[],
    "auto_credit_trigger" TEXT,
    "visible_in_wallet" BOOLEAN NOT NULL DEFAULT true,
    "tnc_text" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voucher_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "voucher_campaign_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "VoucherLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "usage_limit_per_user" INTEGER,
    "lock_token" TEXT,
    "locked_at" TIMESTAMP(3),
    "lock_expires_at" TIMESTAMP(3),
    "lock_order_id" UUID,
    "visible_in_wallet" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_redemptions" (
    "id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_id" UUID,
    "payment_intent_id" UUID,
    "status" "VoucherRedemptionStatus" NOT NULL DEFAULT 'LOCKED',
    "lock_token" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "voucher_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_voucher_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "max_redemptions" INTEGER NOT NULL DEFAULT 1,
    "redeemed_count" INTEGER NOT NULL DEFAULT 0,
    "redeemed_by_customer_id" UUID,
    "redeemed_at" TIMESTAMP(3),
    "campaign_code" TEXT,
    "tnc_text" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_voucher_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_wallet_balance_customer_id_key" ON "user_wallet_balance"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_transactions_customer_id_created_at_idx" ON "wallet_transactions"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_transactions_reference_type_reference_id_idx" ON "wallet_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "rewards_points_ledger_customer_id_created_at_idx" ON "rewards_points_ledger"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "rewards_points_ledger_reference_type_reference_id_idx" ON "rewards_points_ledger"("reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_catalog_code_key" ON "reward_catalog"("code");

-- CreateIndex
CREATE INDEX "reward_catalog_is_active_starts_at_ends_at_idx" ON "reward_catalog"("is_active", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "user_rewards_customer_id_status_created_at_idx" ON "user_rewards"("customer_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_campaigns_code_key" ON "voucher_campaigns"("code");

-- CreateIndex
CREATE INDEX "voucher_campaigns_is_active_starts_at_ends_at_idx" ON "voucher_campaigns"("is_active", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_code_key" ON "vouchers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_lock_token_key" ON "vouchers"("lock_token");

-- CreateIndex
CREATE INDEX "vouchers_customer_id_status_expires_at_idx" ON "vouchers"("customer_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "vouchers_voucher_campaign_id_idx" ON "vouchers"("voucher_campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_redemptions_idempotency_key_key" ON "voucher_redemptions"("idempotency_key");

-- CreateIndex
CREATE INDEX "voucher_redemptions_voucher_id_status_idx" ON "voucher_redemptions"("voucher_id", "status");

-- CreateIndex
CREATE INDEX "voucher_redemptions_customer_id_created_at_idx" ON "voucher_redemptions"("customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "gift_voucher_codes_code_key" ON "gift_voucher_codes"("code");

-- CreateIndex
CREATE INDEX "gift_voucher_codes_status_expires_at_idx" ON "gift_voucher_codes"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "customers_referral_code_key" ON "customers"("referral_code");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_idempotency_key_key" ON "payment_intents"("idempotency_key");

-- AddForeignKey
ALTER TABLE "user_wallet_balance" ADD CONSTRAINT "user_wallet_balance_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_wallet_balance_id_fkey" FOREIGN KEY ("user_wallet_balance_id") REFERENCES "user_wallet_balance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards_points_ledger" ADD CONSTRAINT "rewards_points_ledger_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards_points_ledger" ADD CONSTRAINT "rewards_points_ledger_user_wallet_balance_id_fkey" FOREIGN KEY ("user_wallet_balance_id") REFERENCES "user_wallet_balance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog" ADD CONSTRAINT "reward_catalog_voucher_campaign_id_fkey" FOREIGN KEY ("voucher_campaign_id") REFERENCES "voucher_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_rewards" ADD CONSTRAINT "user_rewards_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_rewards" ADD CONSTRAINT "user_rewards_reward_catalog_id_fkey" FOREIGN KEY ("reward_catalog_id") REFERENCES "reward_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_rewards" ADD CONSTRAINT "user_rewards_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_voucher_campaign_id_fkey" FOREIGN KEY ("voucher_campaign_id") REFERENCES "voucher_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_voucher_codes" ADD CONSTRAINT "gift_voucher_codes_redeemed_by_customer_id_fkey" FOREIGN KEY ("redeemed_by_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
