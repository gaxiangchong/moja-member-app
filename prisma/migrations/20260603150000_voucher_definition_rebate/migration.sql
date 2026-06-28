-- Add flat checkout discount + optional min spend directly on voucher series.
-- Lets admins configure point-redeem discounts in "All series" without a perks campaign.
ALTER TABLE "voucher_definitions"
  ADD COLUMN "rebate_value_sen" INTEGER,
  ADD COLUMN "min_spend_sen" INTEGER;
