DO $$
BEGIN
  CREATE TYPE "WalletTxnType" AS ENUM (
    'TOPUP',
    'SPEND',
    'REFUND',
    'MANUAL_ADJUSTMENT',
    'PROMOTIONAL_BONUS',
    'REVERSAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "stored_wallets" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "balance_cents" INTEGER NOT NULL DEFAULT 0,
  "lifetime_top_up_cents" INTEGER NOT NULL DEFAULT 0,
  "lifetime_spent_cents" INTEGER NOT NULL DEFAULT 0,
  "manual_adjustment_cents" INTEGER NOT NULL DEFAULT 0,
  "promotional_credit_cents" INTEGER NOT NULL DEFAULT 0,
  "pending_credit_cents" INTEGER NOT NULL DEFAULT 0,
  "is_frozen" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stored_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "stored_wallets_customer_id_key" ON "stored_wallets"("customer_id");

DO $$
BEGIN
  ALTER TABLE "stored_wallets"
  ADD CONSTRAINT "stored_wallets_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "stored_wallet_ledger_entries" (
  "id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "type" "WalletTxnType" NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "balance_before" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "created_by_type" TEXT NOT NULL,
  "created_by" TEXT,
  "reversed_by_txn_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stored_wallet_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "stored_wallet_ledger_entries_customer_id_created_at_idx"
  ON "stored_wallet_ledger_entries"("customer_id", "created_at");
CREATE INDEX IF NOT EXISTS "stored_wallet_ledger_entries_wallet_id_created_at_idx"
  ON "stored_wallet_ledger_entries"("wallet_id", "created_at");
CREATE INDEX IF NOT EXISTS "stored_wallet_ledger_entries_type_created_at_idx"
  ON "stored_wallet_ledger_entries"("type", "created_at");
CREATE INDEX IF NOT EXISTS "stored_wallet_ledger_entries_reversed_by_txn_id_idx"
  ON "stored_wallet_ledger_entries"("reversed_by_txn_id");

DO $$
BEGIN
  ALTER TABLE "stored_wallet_ledger_entries"
  ADD CONSTRAINT "stored_wallet_ledger_entries_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "stored_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "stored_wallet_ledger_entries"
  ADD CONSTRAINT "stored_wallet_ledger_entries_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
