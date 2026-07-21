-- CreateEnum
CREATE TYPE "PosSyncSource" AS ENUM ('WEBHOOK', 'PULL');

-- CreateTable
CREATE TABLE "pos_receipts" (
    "id" UUID NOT NULL,
    "salesplay_receipt_id" TEXT NOT NULL,
    "receipt_number" TEXT,
    "shop_id" TEXT,
    "terminal" TEXT,
    "business_date" DATE NOT NULL,
    "sold_at" TIMESTAMP(3),
    "gross_cents" INTEGER NOT NULL DEFAULT 0,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "tax_cents" INTEGER NOT NULL DEFAULT 0,
    "net_cents" INTEGER NOT NULL DEFAULT 0,
    "payment_type" TEXT,
    "customer_id" UUID,
    "origin_online_order_id" UUID,
    "source" "PosSyncSource" NOT NULL DEFAULT 'WEBHOOK',
    "raw_payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_receipt_lines" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "product_code" TEXT,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,

    CONSTRAINT "pos_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_credit_notes" (
    "id" UUID NOT NULL,
    "salesplay_credit_note_id" TEXT NOT NULL,
    "salesplay_receipt_id" TEXT,
    "business_date" DATE NOT NULL,
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "customer_id" UUID,
    "source" "PosSyncSource" NOT NULL DEFAULT 'WEBHOOK',
    "raw_payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salesplay_sync_state" (
    "id" UUID NOT NULL,
    "resource" TEXT NOT NULL,
    "cursor" TEXT,
    "last_pulled_at" TIMESTAMP(3),
    "last_webhook_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salesplay_sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_receipts_salesplay_receipt_id_key" ON "pos_receipts"("salesplay_receipt_id");

-- CreateIndex
CREATE INDEX "pos_receipts_business_date_idx" ON "pos_receipts"("business_date");

-- CreateIndex
CREATE INDEX "pos_receipts_customer_id_business_date_idx" ON "pos_receipts"("customer_id", "business_date");

-- CreateIndex
CREATE INDEX "pos_receipts_origin_online_order_id_idx" ON "pos_receipts"("origin_online_order_id");

-- CreateIndex
CREATE INDEX "pos_receipt_lines_receipt_id_idx" ON "pos_receipt_lines"("receipt_id");

-- CreateIndex
CREATE INDEX "pos_receipt_lines_product_code_idx" ON "pos_receipt_lines"("product_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos_credit_notes_salesplay_credit_note_id_key" ON "pos_credit_notes"("salesplay_credit_note_id");

-- CreateIndex
CREATE INDEX "pos_credit_notes_business_date_idx" ON "pos_credit_notes"("business_date");

-- CreateIndex
CREATE INDEX "pos_credit_notes_salesplay_receipt_id_idx" ON "pos_credit_notes"("salesplay_receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "salesplay_sync_state_resource_key" ON "salesplay_sync_state"("resource");

-- AddForeignKey
ALTER TABLE "pos_receipts" ADD CONSTRAINT "pos_receipts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_receipt_lines" ADD CONSTRAINT "pos_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "pos_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_credit_notes" ADD CONSTRAINT "pos_credit_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
