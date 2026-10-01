-- Automatic vouchers (welcome / birthday / referral / win-back / all-members).
--
-- issue_key records why a voucher was issued ("welcome", "birthday:2026",
-- "referral:<friend id>", ...). The unique index lets the database, not
-- check-then-insert application code, guarantee a member is never issued the
-- same automatic voucher twice. Hand-issued vouchers leave it NULL, and
-- Postgres treats NULLs as distinct, so they are unaffected.
ALTER TABLE "vouchers" ADD COLUMN "issue_key" VARCHAR(80);

CREATE UNIQUE INDEX "vouchers_voucher_campaign_id_customer_id_issue_key_key"
  ON "vouchers"("voucher_campaign_id", "customer_id", "issue_key");

-- Referral campaigns: the referred friend's first order must reach this many
-- sen (RM30 = 3000) for the referrer to earn the voucher. Admin-configurable.
ALTER TABLE "voucher_campaigns" ADD COLUMN "qualifying_min_spend" INTEGER;
