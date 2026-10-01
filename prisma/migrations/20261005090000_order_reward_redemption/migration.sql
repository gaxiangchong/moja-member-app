-- A points reward redeemed on a shop order: which one, what it cost, and whether the points were returned.
ALTER TABLE "customer_orders"
  ADD COLUMN "reward_id" VARCHAR(64),
  ADD COLUMN "reward_title" VARCHAR(200),
  ADD COLUMN "reward_points_spent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reward_points_refunded_at" TIMESTAMP(3);
