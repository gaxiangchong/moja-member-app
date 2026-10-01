-- Credit top-up bonus ("top up RM100, get RM20 extra").
--
-- The bonus is decided when the payment starts and stored here, so changing the
-- offer while a payment is in flight cannot change what that payment earns.
ALTER TABLE "payment_intents" ADD COLUMN "bonus_cents" INTEGER NOT NULL DEFAULT 0;
