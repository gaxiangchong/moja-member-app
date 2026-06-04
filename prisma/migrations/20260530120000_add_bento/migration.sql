-- CreateEnum
CREATE TYPE "BentoPackageCode" AS ENUM ('ONE_TIME', 'DAYS_7', 'DAYS_15', 'DAYS_30');

-- CreateEnum
CREATE TYPE "BentoMealOption" AS ENUM ('LUNCH', 'DINNER', 'BOTH');

-- CreateEnum
CREATE TYPE "BentoRiceType" AS ENUM ('WHITE', 'BROWN');

-- CreateEnum
CREATE TYPE "BentoDinnerVariant" AS ENUM ('VEG', 'NONVEG');

-- CreateEnum
CREATE TYPE "BentoSubscriptionStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BentoDeliveryStatus" AS ENUM ('SCHEDULED', 'DELIVERED', 'SKIPPED');

-- CreateTable
CREATE TABLE "bento_packages" (
    "id" UUID NOT NULL,
    "code" "BentoPackageCode" NOT NULL,
    "label" TEXT NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "price_per_meal_cents" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bento_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bento_subscriptions" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "meal_option" "BentoMealOption" NOT NULL,
    "dinner_variant" "BentoDinnerVariant" NOT NULL,
    "rice_type" "BentoRiceType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "status" "BentoSubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "payment_intent_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bento_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bento_delivery_days" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "delivery_date" DATE NOT NULL,
    "includes_lunch" BOOLEAN NOT NULL,
    "includes_dinner" BOOLEAN NOT NULL,
    "status" "BentoDeliveryStatus" NOT NULL DEFAULT 'SCHEDULED',

    CONSTRAINT "bento_delivery_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bento_packages_code_key" ON "bento_packages"("code");

-- CreateIndex
CREATE INDEX "bento_subscriptions_customer_id_created_at_idx" ON "bento_subscriptions"("customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bento_delivery_days_subscription_id_delivery_date_key" ON "bento_delivery_days"("subscription_id", "delivery_date");

-- AddForeignKey
ALTER TABLE "bento_subscriptions" ADD CONSTRAINT "bento_subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bento_subscriptions" ADD CONSTRAINT "bento_subscriptions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "bento_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bento_delivery_days" ADD CONSTRAINT "bento_delivery_days_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "bento_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
