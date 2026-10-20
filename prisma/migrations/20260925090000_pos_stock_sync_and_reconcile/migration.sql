-- Phase 3: SalesPlay stock sync + nightly reconcile.
--
-- No new behaviour required for the POS decrement itself (it reuses the
-- existing qty/reserved_qty columns via ProductStockService), but the
-- kitchen's end-of-day physical recount needs somewhere to land so the
-- variance can be shown on the day grid.

ALTER TABLE "product_stock_days"
  ADD COLUMN "actual_qty" INTEGER,
  ADD COLUMN "reconciled_at" TIMESTAMP(3);
