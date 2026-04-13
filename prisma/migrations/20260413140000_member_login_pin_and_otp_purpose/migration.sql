-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER', 'RECOVERY');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN "login_pin_hash" TEXT;

-- AlterTable
ALTER TABLE "otp_challenges" ADD COLUMN "purpose" "OtpPurpose" NOT NULL DEFAULT 'REGISTER';
