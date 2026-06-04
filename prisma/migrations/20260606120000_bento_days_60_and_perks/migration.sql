-- AlterEnum
ALTER TYPE "BentoPackageCode" ADD VALUE 'DAYS_60';

-- AlterTable
ALTER TABLE "bento_packages" ADD COLUMN "include_free_soup_and_drinks" BOOLEAN NOT NULL DEFAULT false;
