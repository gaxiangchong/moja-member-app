-- Ops queue: mark when an order is fulfilled on the line display.
ALTER TABLE "customer_orders" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS "customer_orders_status_placed_at_idx" ON "customer_orders" ("status", "placed_at");
