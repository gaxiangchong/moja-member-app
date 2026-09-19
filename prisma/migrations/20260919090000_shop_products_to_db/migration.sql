-- Shop catalog products move from data/shop-catalog.products.json into Postgres.
-- Layout and popular config move into app_settings (keys shop_catalog.layout /
-- shop_catalog.popular). Existing JSON files are imported once on first boot
-- by ShopCatalogService.onModuleInit when this table is empty.
CREATE TABLE "shop_products" (
    "id" VARCHAR(160) NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "sold_out" BOOLEAN NOT NULL DEFAULT false,
    "available_qty" INTEGER,
    "salesplay_product_code" VARCHAR(64),
    "document" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shop_products_is_active_sort_order_idx" ON "shop_products"("is_active", "sort_order");
CREATE INDEX "shop_products_category_idx" ON "shop_products"("category");
CREATE INDEX "shop_products_salesplay_product_code_idx" ON "shop_products"("salesplay_product_code");
