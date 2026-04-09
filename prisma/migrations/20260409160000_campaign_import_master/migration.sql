-- CreateEnum helpers
DO $$ BEGIN
  CREATE TYPE "MasterEntryCategory" AS ENUM ('MEMBER_TIER', 'STORE', 'SOURCE_CHANNEL', 'NOTE_CATEGORY', 'TAG_VOCAB');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BusinessRuleKind" AS ENUM ('WALLET_BONUS', 'LOYALTY_EARN', 'LOYALTY_REDEEM', 'LOYALTY_EXPIRY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ImportBatchKind" AS ENUM ('CUSTOMER_MASTER', 'WALLET_ADJUSTMENT', 'LOYALTY_ADJUSTMENT', 'VOUCHER_ASSIGNMENT', 'TAGS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ImportBatchStatus" AS ENUM ('PREVIEW', 'COMMITTED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ExportJobStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'XLSX');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ExportJobKind" AS ENUM (
    'CUSTOMERS',
    'WALLET_LEDGER',
    'POINTS_LEDGER',
    'VOUCHERS_ISSUED',
    'VOUCHERS_REDEEMED',
    'AUDIT_LOGS',
    'IMPORT_BATCHES',
    'SEGMENT_AUDIENCE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "segment_audiences" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "filters" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "segment_audiences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "campaign_runs" (
  "id" UUID NOT NULL,
  "segment_audience_id" UUID,
  "filters_snapshot" JSONB,
  "action" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "customer_matched" INTEGER NOT NULL DEFAULT 0,
  "customer_succeeded" INTEGER NOT NULL DEFAULT 0,
  "customer_failed" INTEGER NOT NULL DEFAULT 0,
  "errors" JSONB,
  CONSTRAINT "campaign_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "campaign_runs_created_at_idx" ON "campaign_runs"("created_at");

DO $$ BEGIN
  ALTER TABLE "campaign_runs"
  ADD CONSTRAINT "campaign_runs_segment_audience_id_fkey"
  FOREIGN KEY ("segment_audience_id") REFERENCES "segment_audiences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "import_batches" (
  "id" UUID NOT NULL,
  "kind" "ImportBatchKind" NOT NULL,
  "file_name" TEXT NOT NULL,
  "uploaded_by" TEXT NOT NULL,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "ImportBatchStatus" NOT NULL DEFAULT 'PREVIEW',
  "total_rows" INTEGER NOT NULL DEFAULT 0,
  "success_rows" INTEGER NOT NULL DEFAULT 0,
  "failed_rows" INTEGER NOT NULL DEFAULT 0,
  "preview_rows" JSONB,
  "row_errors" JSONB,
  "summary" JSONB,
  "file_storage_path" TEXT,
  CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "import_batches_kind_uploaded_at_idx" ON "import_batches"("kind", "uploaded_at");

CREATE TABLE IF NOT EXISTS "export_jobs" (
  "id" UUID NOT NULL,
  "kind" "ExportJobKind" NOT NULL,
  "format" "ExportFormat" NOT NULL,
  "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
  "params" JSONB,
  "row_count" INTEGER,
  "file_name" TEXT,
  "storage_path" TEXT,
  "error_message" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "export_jobs_created_at_idx" ON "export_jobs"("created_at");

CREATE TABLE IF NOT EXISTS "master_entries" (
  "id" UUID NOT NULL,
  "category" "MasterEntryCategory" NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "master_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "master_entries_category_code_key" ON "master_entries"("category", "code");
CREATE INDEX IF NOT EXISTS "master_entries_category_is_active_idx" ON "master_entries"("category", "is_active");

CREATE TABLE IF NOT EXISTS "business_rules" (
  "id" UUID NOT NULL,
  "kind" "BusinessRuleKind" NOT NULL,
  "name" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "business_rules_kind_is_active_idx" ON "business_rules"("kind", "is_active");
