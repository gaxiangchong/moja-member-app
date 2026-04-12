-- Sequential public order numbers + daily sales close marker (UTC date).

CREATE SEQUENCE IF NOT EXISTS customer_orders_order_number_seq START WITH 1000;

ALTER TABLE "customer_orders" ADD COLUMN IF NOT EXISTS "order_number" INTEGER;

UPDATE "customer_orders"
SET "order_number" = sub.n
FROM (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY "placed_at" ASC) + 999)::int AS n
  FROM "customer_orders"
  WHERE "order_number" IS NULL
) AS sub
WHERE "customer_orders".id = sub.id;

ALTER TABLE "customer_orders" ALTER COLUMN "order_number" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_orders_order_number_key'
  ) THEN
    ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_order_number_key" UNIQUE ("order_number");
  END IF;
END $$;

SELECT setval(
  'customer_orders_order_number_seq',
  GREATEST(999, COALESCE((SELECT MAX("order_number") FROM "customer_orders"), 999))
);

ALTER TABLE "customer_orders"
  ALTER COLUMN "order_number" SET DEFAULT nextval('customer_orders_order_number_seq'::regclass);

ALTER SEQUENCE customer_orders_order_number_seq OWNED BY "customer_orders"."order_number";

CREATE TABLE IF NOT EXISTS "daily_sales_closes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_date" DATE NOT NULL,
    "closed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_sales_closes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_sales_closes_business_date_key" ON "daily_sales_closes" ("business_date");
