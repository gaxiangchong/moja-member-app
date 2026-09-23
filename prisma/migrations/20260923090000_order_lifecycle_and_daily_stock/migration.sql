-- Phase 1: structured order lifecycle + per-date kitchen stock.
--
-- `customer_orders.status` stays TEXT (several reports filter it from raw
-- SQL); the new `preparing` / `ready` / `cancelled` / `refunded` values are
-- defined in src/orders/order-status.ts. Existing values are unchanged.

CREATE TYPE "OrderFulfilmentType" AS ENUM ('IN_STORE', 'PICKUP', 'DELIVERY');

ALTER TABLE "customer_orders"
  ADD COLUMN "delivery_fee_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "fulfilment_type" "OrderFulfilmentType" NOT NULL DEFAULT 'PICKUP',
  ADD COLUMN "scheduled_date" DATE,
  ADD COLUMN "scheduled_slot" VARCHAR(5),
  ADD COLUMN "preparing_at" TIMESTAMP(3),
  ADD COLUMN "ready_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancel_reason" VARCHAR(200);

-- Backfill the structured columns from the free-text summary written by
-- client-web (`fulfillmentSummaryLines`):
--   in store  -> ["In store · prepare now"]
--   pickup    -> ["Self pickup", "Date: YYYY-MM-DD", "Time: HH:mm"]
-- Anything unrecognised keeps the PICKUP default with no date, which is how
-- these orders already behave.
UPDATE "customer_orders"
SET "fulfilment_type" = 'IN_STORE'
WHERE "fulfillment_summary" @> '["In store · prepare now"]'::jsonb;

UPDATE "customer_orders" o
SET "scheduled_date" = to_date(substring(d.v FROM 'Date: ([0-9]{4}-[0-9]{2}-[0-9]{2})'), 'YYYY-MM-DD')
FROM (
  SELECT c.id, jsonb_array_elements_text(c."fulfillment_summary") AS v
  FROM "customer_orders" c
  WHERE jsonb_typeof(c."fulfillment_summary") = 'array'
) d
WHERE o.id = d.id AND d.v ~ 'Date: [0-9]{4}-[0-9]{2}-[0-9]{2}';

UPDATE "customer_orders" o
SET "scheduled_slot" = substring(t.v FROM 'Time: ([0-9]{2}:[0-9]{2})')
FROM (
  SELECT c.id, jsonb_array_elements_text(c."fulfillment_summary") AS v
  FROM "customer_orders" c
  WHERE jsonb_typeof(c."fulfillment_summary") = 'array'
) t
WHERE o.id = t.id AND t.v ~ 'Time: [0-9]{2}:[0-9]{2}';

-- Historical completed orders: treat the existing completion timestamp as the
-- moment they were handed over, so the new timeline is not empty for them.
UPDATE "customer_orders"
SET "ready_at" = "completed_at"
WHERE "status" = 'completed' AND "completed_at" IS NOT NULL;

CREATE INDEX "customer_orders_scheduled_date_scheduled_slot_idx"
  ON "customer_orders"("scheduled_date", "scheduled_slot");

-- Per-day kitchen stock. Products with no row for a date fall back to
-- shop_products.available_qty until the kitchen sets that day explicitly.
CREATE TABLE "product_stock_days" (
    "id" UUID NOT NULL,
    "product_id" VARCHAR(160) NOT NULL,
    "business_date" DATE NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "reserved_qty" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_stock_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_stock_days_product_id_business_date_key"
  ON "product_stock_days"("product_id", "business_date");
CREATE INDEX "product_stock_days_business_date_idx"
  ON "product_stock_days"("business_date");
