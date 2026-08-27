-- Allow legacy customer vouchers to be reserved during shop checkout so two
-- concurrent payments cannot silently redeem the same ISSUED voucher twice.
ALTER TYPE "VoucherStatus" ADD VALUE 'LOCKED' AFTER 'ISSUED';
