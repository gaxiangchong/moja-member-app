-- Admin password resets must end existing sessions. Tokens carry `iat`, so a
-- token issued before this timestamp is rejected by AdminAuthGuard.
-- NULL for existing rows = no reset has happened, so their tokens stay valid.
ALTER TABLE "admin_users" ADD COLUMN "password_changed_at" TIMESTAMP(3);
