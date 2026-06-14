ALTER TABLE "customer_orders"
ADD COLUMN "salesplay_system_unique_id" TEXT,
ADD COLUMN "salesplay_synced_at" TIMESTAMP(3);
