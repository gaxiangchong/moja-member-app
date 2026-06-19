-- Allow multiple meals per pickup day (group/share). Additive + backfill.
ALTER TABLE "bento_delivery_days"
  ADD COLUMN "lunch_qty" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dinner_qty" INTEGER NOT NULL DEFAULT 0;

-- Existing rows keep their current single meal: qty = 1 where the meal is present.
UPDATE "bento_delivery_days"
SET
  "lunch_qty" = CASE WHEN "includes_lunch" THEN 1 ELSE 0 END,
  "dinner_qty" = CASE WHEN "includes_dinner" THEN 1 ELSE 0 END;
