-- Orders paid (fully) with wallet credits: how much, and whether it was returned.
ALTER TABLE "customer_orders"
  ADD COLUMN "paid_with_credits_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "credits_refunded_at" TIMESTAMP(3);
