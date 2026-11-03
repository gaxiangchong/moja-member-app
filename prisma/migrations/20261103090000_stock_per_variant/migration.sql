-- Kitchen stock per size: a cake's 6 inch, 8 inch and Slice are counted
-- separately. `variant` is the catalog variant label; '' is the whole
-- product (products without sizes, and every row written before this).
ALTER TABLE "product_stock_days"
  ADD COLUMN "variant" VARCHAR(80) NOT NULL DEFAULT '';

DROP INDEX "product_stock_days_product_id_business_date_key";

CREATE UNIQUE INDEX "product_stock_days_product_id_variant_business_date_key"
  ON "product_stock_days"("product_id", "variant", "business_date");
