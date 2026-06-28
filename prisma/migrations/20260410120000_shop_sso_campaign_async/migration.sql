-- CreateEnum
CREATE TYPE "CampaignRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "campaign_runs" ADD COLUMN     "status" "CampaignRunStatus" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "finished_at" TIMESTAMP(3),
ADD COLUMN     "customer_processed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "duplicates_skipped" INTEGER NOT NULL DEFAULT 0;

UPDATE "campaign_runs"
SET "customer_processed" = COALESCE("customer_succeeded", 0) + COALESCE("customer_failed", 0)
WHERE "customer_processed" = 0
  AND (COALESCE("customer_succeeded", 0) + COALESCE("customer_failed", 0)) > 0;

-- CreateTable
CREATE TABLE "shop_handoff_jtis" (
    "jti" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_handoff_jtis_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "shop_handoff_jtis_expires_at_idx" ON "shop_handoff_jtis"("expires_at");

-- AddForeignKey
ALTER TABLE "shop_handoff_jtis" ADD CONSTRAINT "shop_handoff_jtis_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "customer_vouchers" ADD COLUMN     "campaign_run_id" UUID;

-- AddForeignKey
ALTER TABLE "customer_vouchers" ADD CONSTRAINT "customer_vouchers_campaign_run_id_fkey" FOREIGN KEY ("campaign_run_id") REFERENCES "campaign_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex (idempotent voucher issuance per campaign run)
CREATE UNIQUE INDEX "customer_vouchers_customer_id_definition_id_campaign_run_id_key" ON "customer_vouchers"("customer_id", "definition_id", "campaign_run_id");
