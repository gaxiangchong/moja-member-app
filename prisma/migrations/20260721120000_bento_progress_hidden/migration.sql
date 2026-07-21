-- Admins can archive old/test plans out of the pickup-progress report.
-- Reversible flag only; the subscription row itself is never deleted.
ALTER TABLE "bento_subscriptions" ADD COLUMN "progress_hidden_at" TIMESTAMP(3);
