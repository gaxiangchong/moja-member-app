-- Membership tier is judged on points EARNED over the member's lifetime, not on the
-- spendable balance, so redeeming points no longer lowers a tier.
ALTER TABLE "loyalty_wallets"
  ADD COLUMN "lifetime_earned_points" INTEGER NOT NULL DEFAULT 0;

-- Backfill from the ledger: every positive entry except a returned reward.
UPDATE "loyalty_wallets" w
SET "lifetime_earned_points" = COALESCE((
  SELECT SUM(l."delta_points")
  FROM "loyalty_ledger_entries" l
  WHERE l."customer_id" = w."customer_id"
    AND l."delta_points" > 0
    AND l."reason" NOT LIKE 'refund%'
), 0);

-- Points that pre-date the ledger can never count for less than what is held now.
UPDATE "loyalty_wallets"
SET "lifetime_earned_points" = GREATEST("lifetime_earned_points", "points_cached");

-- Bring the stored tier in line.
UPDATE "customers" c
SET "member_tier" = CASE
  WHEN w."lifetime_earned_points" >= 2000 THEN 'platinum'
  WHEN w."lifetime_earned_points" >= 1000 THEN 'gold'
  ELSE 'silver'
END
FROM "loyalty_wallets" w
WHERE w."customer_id" = c."id";
