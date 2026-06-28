-- Perks auto-campaign rules (RM/sen, campaign dates, structured criteria; no JSON in UI).

CREATE TYPE "PerksProgramKind" AS ENUM ('VOUCHER_REBATE', 'REWARD_FREE_ITEM', 'REWARD_POINTS_REDEEM');

CREATE TYPE "PerksCriteriaKind" AS ENUM (
  'CAMPAIGN_WINDOW_ONLY',
  'NEW_MEMBER_WITHIN_DAYS',
  'SINGLE_PURCHASE_MIN_RM',
  'TIER_AND_PURCHASE_MIN_RM',
  'BIRTHDAY_DURING_CAMPAIGN',
  'WALLET_TOPUP_MIN_RM',
  'REFERRALS_MIN_COUNT',
  'REENGAGEMENT_INACTIVE_DAYS'
);

CREATE TABLE "perks_campaign_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "program_kind" "PerksProgramKind" NOT NULL,
  "criteria_kind" "PerksCriteriaKind" NOT NULL,
  "campaign_start_date" DATE NOT NULL,
  "campaign_end_date" DATE NOT NULL,
  "min_purchase_amount_sen" INTEGER,
  "rebate_value_sen" INTEGER,
  "min_wallet_topup_sen" INTEGER,
  "within_days_of_signup" INTEGER,
  "min_referral_count" INTEGER,
  "inactive_days" INTEGER,
  "min_member_tier" TEXT,
  "voucher_definition_id" UUID NOT NULL,
  "max_grants_per_customer" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "perks_campaign_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "perks_campaign_rules_is_active_idx" ON "perks_campaign_rules"("is_active");
CREATE INDEX "perks_campaign_rules_program_kind_idx" ON "perks_campaign_rules"("program_kind");
CREATE INDEX "perks_campaign_rules_voucher_definition_id_idx" ON "perks_campaign_rules"("voucher_definition_id");

ALTER TABLE "perks_campaign_rules"
  ADD CONSTRAINT "perks_campaign_rules_voucher_definition_id_fkey"
  FOREIGN KEY ("voucher_definition_id") REFERENCES "voucher_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
