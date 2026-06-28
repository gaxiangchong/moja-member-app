-- CreateEnum
CREATE TYPE "VoucherPushTriggerType" AS ENUM ('NEWCOMER', 'TOPUP_THRESHOLD', 'REFERRAL', 'BIRTHDAY', 'REENGAGEMENT');

-- AlterTable
ALTER TABLE "voucher_definitions" ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "reward_category" TEXT,
ADD COLUMN     "show_in_rewards_catalog" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reward_sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reward_valid_from" TIMESTAMP(3),
ADD COLUMN     "reward_valid_until" TIMESTAMP(3),
ADD COLUMN     "max_total_issued" INTEGER;

-- CreateTable
CREATE TABLE "voucher_push_rules" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "trigger_type" "VoucherPushTriggerType" NOT NULL,
    "trigger_config" JSONB NOT NULL,
    "voucher_definition_id" UUID NOT NULL,
    "max_grants_per_customer" INTEGER,
    "cooldown_days" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voucher_push_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voucher_push_rules_is_active_sort_order_idx" ON "voucher_push_rules"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "voucher_push_rules_voucher_definition_id_idx" ON "voucher_push_rules"("voucher_definition_id");

-- AddForeignKey
ALTER TABLE "voucher_push_rules" ADD CONSTRAINT "voucher_push_rules_voucher_definition_id_fkey" FOREIGN KEY ("voucher_definition_id") REFERENCES "voucher_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
