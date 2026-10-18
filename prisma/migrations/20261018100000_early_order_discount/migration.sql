-- Early-order discount on whole cakes, already taken off total_cents.
ALTER TABLE "customer_orders" ADD COLUMN "early_order_discount_cents" INTEGER NOT NULL DEFAULT 0;
