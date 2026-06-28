/*
  Warnings:

  - A unique constraint covering the columns `[referral_code]` on the table `customers` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CampaignTemplate" AS ENUM ('WELCOME', 'BIRTHDAY', 'REFERRAL', 'WINBACK', 'SPEND_EARN', 'CUSTOM');

-- DropIndex
DROP INDEX IF EXISTS "otp_challenges_email_created_at_idx";

-- DropIndex
DROP INDEX IF EXISTS "otp_request_logs_email_created_at_idx";

-- AlterTable
ALTER TABLE "voucher_campaigns" ADD COLUMN     "code_prefix" VARCHAR(16),
ADD COLUMN     "template" "CampaignTemplate",
ADD COLUMN     "voucher_valid_days" INTEGER;

-- CreateIndex
-- A partial unique index "customers_referral_code_key" already exists from
-- 20260411120000_member_orders_referrals; replace it with the full unique index.
DROP INDEX IF EXISTS "customers_referral_code_key";
CREATE UNIQUE INDEX "customers_referral_code_key" ON "customers"("referral_code");
