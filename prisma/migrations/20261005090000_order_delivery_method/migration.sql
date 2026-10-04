-- DELIVERY orders are either a local courier or a nationwide parcel.
ALTER TABLE "customer_orders" ADD COLUMN "delivery_method" VARCHAR(8);
