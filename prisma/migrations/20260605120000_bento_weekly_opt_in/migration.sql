-- CreateTable
CREATE TABLE "bento_weekly_opt_ins" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "opted_in" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bento_weekly_opt_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bento_weekly_opt_ins_customer_id_week_start_key" ON "bento_weekly_opt_ins"("customer_id", "week_start");

-- AddForeignKey
ALTER TABLE "bento_weekly_opt_ins" ADD CONSTRAINT "bento_weekly_opt_ins_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
