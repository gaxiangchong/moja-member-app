-- AlterEnum
ALTER TYPE "BentoPackageCode" ADD VALUE 'NEWCOMER_3';

-- AlterTable
ALTER TABLE "bento_packages" ADD COLUMN "meal_credits" INTEGER;
ALTER TABLE "bento_packages" ADD COLUMN "fixed_checkout_cents" INTEGER;

UPDATE "bento_packages" SET "meal_credits" = "duration_days" WHERE "meal_credits" IS NULL;
ALTER TABLE "bento_packages" ALTER COLUMN "meal_credits" SET NOT NULL;

-- AlterTable
ALTER TABLE "bento_subscriptions" ADD COLUMN "lunch_variant" "BentoDinnerVariant" NOT NULL DEFAULT 'NONVEG';
ALTER TABLE "bento_subscriptions" ADD COLUMN "include_drink_addon" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bento_subscriptions" ADD COLUMN "meal_credits_total" INTEGER;
ALTER TABLE "bento_subscriptions" ADD COLUMN "lunch_credits" INTEGER;
ALTER TABLE "bento_subscriptions" ADD COLUMN "dinner_credits" INTEGER;

UPDATE "bento_subscriptions" s
SET
  "meal_credits_total" = p."meal_credits",
  "lunch_credits" = CASE
    WHEN s."meal_option" = 'LUNCH' THEN p."meal_credits"
    WHEN s."meal_option" = 'DINNER' THEN 0
    ELSE p."meal_credits" / 2
  END,
  "dinner_credits" = CASE
    WHEN s."meal_option" = 'DINNER' THEN p."meal_credits"
    WHEN s."meal_option" = 'LUNCH' THEN 0
    ELSE p."meal_credits" - (p."meal_credits" / 2)
  END
FROM "bento_packages" p
WHERE s."package_id" = p."id" AND s."meal_credits_total" IS NULL;

ALTER TABLE "bento_subscriptions" ALTER COLUMN "meal_credits_total" SET NOT NULL;
ALTER TABLE "bento_subscriptions" ALTER COLUMN "lunch_credits" SET NOT NULL;
ALTER TABLE "bento_subscriptions" ALTER COLUMN "dinner_credits" SET NOT NULL;

ALTER TABLE "bento_subscriptions" ALTER COLUMN "start_date" DROP NOT NULL;
ALTER TABLE "bento_subscriptions" ALTER COLUMN "end_date" DROP NOT NULL;
