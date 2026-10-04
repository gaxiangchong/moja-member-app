-- Per-product "can be shipped nationwide" flag, set in the admin catalog.
ALTER TABLE "shop_products" ADD COLUMN "shippable" BOOLEAN NOT NULL DEFAULT false;

-- Products already in the cookies category were shippable under the old rule.
UPDATE "shop_products" SET "shippable" = true WHERE "category" = 'cookies';
