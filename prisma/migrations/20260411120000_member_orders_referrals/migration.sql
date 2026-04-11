-- Referral codes + attribution
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "referral_code" VARCHAR(20);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "referred_by_customer_id" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "customers_referral_code_key" ON "customers"("referral_code") WHERE "referral_code" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_referred_by_customer_id_fkey'
  ) THEN
    ALTER TABLE "customers"
      ADD CONSTRAINT "customers_referred_by_customer_id_fkey"
      FOREIGN KEY ("referred_by_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "customers_referred_by_customer_id_idx" ON "customers"("referred_by_customer_id");

-- Shop order history (member app)
CREATE TABLE IF NOT EXISTS "customer_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'placed',
    "fulfillment_summary" JSONB,
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customer_orders_customer_id_placed_at_idx" ON "customer_orders"("customer_id", "placed_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_orders_customer_id_fkey'
  ) THEN
    ALTER TABLE "customer_orders"
      ADD CONSTRAINT "customer_orders_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "customer_order_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variant_label" TEXT,
    "unit_price_cents" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "image_url" TEXT,

    CONSTRAINT "customer_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customer_order_lines_order_id_idx" ON "customer_order_lines"("order_id");
CREATE INDEX IF NOT EXISTS "customer_order_lines_product_id_idx" ON "customer_order_lines"("product_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_order_lines_order_id_fkey'
  ) THEN
    ALTER TABLE "customer_order_lines"
      ADD CONSTRAINT "customer_order_lines_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "customer_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
