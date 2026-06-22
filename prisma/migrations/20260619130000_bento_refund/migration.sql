-- Bento refunds: new subscription status + audit table for manual refunds.

-- New terminal status for refunded subscriptions.
ALTER TYPE "BentoSubscriptionStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- System-of-record for each refund (payout handled offline / manually).
CREATE TABLE "bento_refunds" (
  "id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "consumed_meals" INTEGER NOT NULL,
  "single_meal_cents" INTEGER NOT NULL,
  "paid_cents" INTEGER NOT NULL,
  "charged_cents" INTEGER NOT NULL,
  "refund_cents" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "payout_note" TEXT,
  "admin_user_id" UUID,
  "admin_actor_label" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bento_refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bento_refunds_subscription_id_key" ON "bento_refunds"("subscription_id");

ALTER TABLE "bento_refunds"
  ADD CONSTRAINT "bento_refunds_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "bento_subscriptions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
