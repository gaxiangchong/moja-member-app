-- Membership tier follows the loyalty points balance (src/loyalty/member-tier.ts):
-- silver below 1,000, gold from 1,000, platinum from 2,000.

ALTER TABLE "customers" ALTER COLUMN "member_tier" SET DEFAULT 'silver';

UPDATE "customers" c
SET "member_tier" = CASE
  WHEN p.points >= 2000 THEN 'platinum'
  WHEN p.points >= 1000 THEN 'gold'
  ELSE 'silver'
END
FROM (
  SELECT c2."id", COALESCE(w."points_cached", 0) AS points
  FROM "customers" c2
  LEFT JOIN "loyalty_wallets" w ON w."customer_id" = c2."id"
) p
WHERE p."id" = c."id";
