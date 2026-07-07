-- CreateEnum
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailTemplateKind" AS ENUM ('WELCOME', 'WEEKLY', 'EVENT', 'PLAIN');

-- CreateEnum
CREATE TYPE "EmailAudienceKind" AS ENUM ('OPTED_IN', 'ALL_WITH_EMAIL');

-- CreateEnum
CREATE TYPE "EmailRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "template_kind" "EmailTemplateKind" NOT NULL DEFAULT 'PLAIN',
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "body_html" TEXT NOT NULL,
    "audience" "EmailAudienceKind" NOT NULL DEFAULT 'OPTED_IN',
    "tier_filter" TEXT,
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign_recipients" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "status" "EmailRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "email_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_campaigns_status_scheduled_at_idx" ON "email_campaigns"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_campaign_recipients_campaign_id_customer_id_key" ON "email_campaign_recipients"("campaign_id", "customer_id");

-- CreateIndex
CREATE INDEX "email_campaign_recipients_campaign_id_status_idx" ON "email_campaign_recipients"("campaign_id", "status");

-- AddForeignKey
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
