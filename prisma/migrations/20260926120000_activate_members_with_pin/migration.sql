-- Members become ACTIVE once they can sign in (a login PIN is set). App signups
-- previously stayed DRAFT forever, which kept them out of birthday / win-back
-- campaign sweeps, "issue to all active members", and email audiences.
-- Members without a PIN (counter registrations not yet activated) stay DRAFT.

UPDATE "customers"
SET "status" = 'ACTIVE'
WHERE "status" = 'DRAFT'
  AND "login_pin_hash" IS NOT NULL;
