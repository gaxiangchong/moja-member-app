-- CreateEnum
CREATE TYPE "WorkCalendarDayType" AS ENUM ('REGULAR', 'OFF', 'PUBLIC_HOLIDAY');

-- CreateTable
CREATE TABLE "payroll_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "standard_workday_minutes" INTEGER NOT NULL DEFAULT 480,
    "overtime_multiplier_bps" INTEGER NOT NULL DEFAULT 15000,
    "public_holiday_multiplier_bps" INTEGER NOT NULL DEFAULT 20000,
    "off_day_worked_multiplier_bps" INTEGER NOT NULL DEFAULT 10000,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "payroll_settings" ("id", "standard_workday_minutes", "overtime_multiplier_bps", "public_holiday_multiplier_bps", "off_day_worked_multiplier_bps", "updated_at")
VALUES ('default', 480, 15000, 20000, 10000, CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "position_title" TEXT NOT NULL DEFAULT '',
    "hourly_rate_cents" INTEGER NOT NULL DEFAULT 0,
    "commission_rate_bps" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- CreateTable
CREATE TABLE "employee_time_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "clock_in_at" TIMESTAMP(3) NOT NULL,
    "clock_out_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_time_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_time_entries_employee_id_clock_in_at_idx" ON "employee_time_entries"("employee_id", "clock_in_at");

ALTER TABLE "employee_time_entries" ADD CONSTRAINT "employee_time_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "work_calendar_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "day_type" "WorkCalendarDayType" NOT NULL,
    "label" TEXT,

    CONSTRAINT "work_calendar_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_calendar_days_date_key" ON "work_calendar_days"("date");
