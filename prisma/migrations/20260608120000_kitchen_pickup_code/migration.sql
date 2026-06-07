-- Add unique 6-digit kitchen pickup codes for bento collection.
ALTER TABLE "customers" ADD COLUMN "kitchen_pickup_code" VARCHAR(6);

CREATE UNIQUE INDEX "customers_kitchen_pickup_code_key" ON "customers"("kitchen_pickup_code");

-- Backfill existing members with sequential codes starting at 100000.
WITH numbered AS (
  SELECT
    id,
    LPAD((ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) + 99999)::text, 6, '0') AS code
  FROM "customers"
)
UPDATE "customers" AS c
SET "kitchen_pickup_code" = n.code
FROM numbered AS n
WHERE c.id = n.id;
