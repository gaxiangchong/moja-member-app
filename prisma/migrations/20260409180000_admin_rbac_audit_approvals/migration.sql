DO $$ BEGIN
  CREATE TYPE "AdminRoleCode" AS ENUM (
    'SUPER_ADMIN', 'CRM_ADMIN', 'MARKETING_ADMIN', 'FINANCE_ADMIN',
    'SUPPORT_ADMIN', 'READONLY_ANALYST', 'STORE_MANAGER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ApprovalRequestKind" AS ENUM ('WALLET_REVERSAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "admin_users" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "display_name" TEXT,
  "role" "AdminRoleCode" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_login_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_users_email_key" ON "admin_users"("email");

CREATE TABLE IF NOT EXISTS "approval_requests" (
  "id" UUID NOT NULL,
  "kind" "ApprovalRequestKind" NOT NULL,
  "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "requester_id" UUID NOT NULL,
  "reviewer_id" UUID,
  "review_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMP(3),
  CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "approval_requests_status_created_at_idx" ON "approval_requests"("status", "created_at");
CREATE INDEX IF NOT EXISTS "approval_requests_requester_id_idx" ON "approval_requests"("requester_id");

DO $$ BEGIN
  ALTER TABLE "approval_requests"
  ADD CONSTRAINT "approval_requests_requester_id_fkey"
  FOREIGN KEY ("requester_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "approval_requests"
  ADD CONSTRAINT "approval_requests_reviewer_id_fkey"
  FOREIGN KEY ("reviewer_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "admin_user_id" UUID;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "admin_role" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "ip_address" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "reason" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "before_value" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "after_value" JSONB;

DO $$ BEGIN
  ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_admin_user_id_fkey"
  FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "audit_logs_admin_user_id_created_at_idx" ON "audit_logs"("admin_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
