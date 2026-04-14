-- CreateTable
CREATE TABLE "payment_intents" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "reference_id" VARCHAR(64) NOT NULL,
    "purpose" VARCHAR(32) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "country" VARCHAR(2) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "channel_code" VARCHAR(64) NOT NULL,
    "xendit_payment_request_id" VARCHAR(128),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_reference_id_key" ON "payment_intents"("reference_id");

-- CreateIndex
CREATE INDEX "payment_intents_customer_id_created_at_idx" ON "payment_intents"("customer_id", "created_at");

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
