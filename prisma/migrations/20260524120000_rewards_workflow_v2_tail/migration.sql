-- Completes rewards_workflow_v2 when the prior migration failed after creating tables
-- but before indexes/FKs (Render P3018 on duplicate customers_referral_code_key).

CREATE UNIQUE INDEX IF NOT EXISTS "payment_intents_idempotency_key_key" ON "payment_intents"("idempotency_key");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_wallet_balance_customer_id_fkey') THEN
    ALTER TABLE "user_wallet_balance" ADD CONSTRAINT "user_wallet_balance_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_customer_id_fkey') THEN
    ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_user_wallet_balance_id_fkey') THEN
    ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_wallet_balance_id_fkey" FOREIGN KEY ("user_wallet_balance_id") REFERENCES "user_wallet_balance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rewards_points_ledger_customer_id_fkey') THEN
    ALTER TABLE "rewards_points_ledger" ADD CONSTRAINT "rewards_points_ledger_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rewards_points_ledger_user_wallet_balance_id_fkey') THEN
    ALTER TABLE "rewards_points_ledger" ADD CONSTRAINT "rewards_points_ledger_user_wallet_balance_id_fkey" FOREIGN KEY ("user_wallet_balance_id") REFERENCES "user_wallet_balance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reward_catalog_voucher_campaign_id_fkey') THEN
    ALTER TABLE "reward_catalog" ADD CONSTRAINT "reward_catalog_voucher_campaign_id_fkey" FOREIGN KEY ("voucher_campaign_id") REFERENCES "voucher_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_rewards_customer_id_fkey') THEN
    ALTER TABLE "user_rewards" ADD CONSTRAINT "user_rewards_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_rewards_reward_catalog_id_fkey') THEN
    ALTER TABLE "user_rewards" ADD CONSTRAINT "user_rewards_reward_catalog_id_fkey" FOREIGN KEY ("reward_catalog_id") REFERENCES "reward_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_rewards_voucher_id_fkey') THEN
    ALTER TABLE "user_rewards" ADD CONSTRAINT "user_rewards_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_customer_id_fkey') THEN
    ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_voucher_campaign_id_fkey') THEN
    ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_voucher_campaign_id_fkey" FOREIGN KEY ("voucher_campaign_id") REFERENCES "voucher_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'voucher_redemptions_voucher_id_fkey') THEN
    ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'voucher_redemptions_customer_id_fkey') THEN
    ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_voucher_codes_redeemed_by_customer_id_fkey') THEN
    ALTER TABLE "gift_voucher_codes" ADD CONSTRAINT "gift_voucher_codes_redeemed_by_customer_id_fkey" FOREIGN KEY ("redeemed_by_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
