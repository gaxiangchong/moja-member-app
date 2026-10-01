-- Points redeemed by a cashier at the counter: what to key into the till, who did it,
-- and whether it was undone. One row per redemption.
CREATE TABLE "counter_redemptions" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "reward_catalog_id" UUID,
  "reward_title" VARCHAR(200) NOT NULL,
  "points_spent" INTEGER NOT NULL,
  "discount_cents" INTEGER,
  "percentage_off" INTEGER,
  "min_spend_cents" INTEGER,
  "voucher_id" UUID,
  "voucher_code" VARCHAR(64) NOT NULL,
  "status" VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
  "verification" VARCHAR(8) NOT NULL,
  "staff_code" VARCHAR(32) NOT NULL,
  "staff_name" VARCHAR(120),
  "idempotency_key" VARCHAR(128) NOT NULL,
  "salesplay_receipt_ref" VARCHAR(60),
  "undone_at" TIMESTAMP(3),
  "undone_by_staff" VARCHAR(32),
  "undo_reason" VARCHAR(200),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "counter_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "counter_redemptions_idempotency_key_key" ON "counter_redemptions"("idempotency_key");
CREATE INDEX "counter_redemptions_customer_id_created_at_idx" ON "counter_redemptions"("customer_id", "created_at");
CREATE INDEX "counter_redemptions_created_at_idx" ON "counter_redemptions"("created_at");

ALTER TABLE "counter_redemptions"
  ADD CONSTRAINT "counter_redemptions_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
