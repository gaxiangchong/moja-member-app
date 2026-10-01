-- Delivery orders: address, contact, and who arranges the courier.
ALTER TABLE "customer_orders"
  ADD COLUMN "delivery_address" TEXT,
  ADD COLUMN "delivery_contact_name" VARCHAR(120),
  ADD COLUMN "delivery_contact_phone" VARCHAR(32),
  ADD COLUMN "delivery_arrangement" VARCHAR(8);
