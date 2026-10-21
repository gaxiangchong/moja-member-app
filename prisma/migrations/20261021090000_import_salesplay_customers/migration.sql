-- Import members exported from SalesPlay Back Office: links each one to its
-- SalesPlay customer id (so in-store receipts reach the member) and creates
-- members that only ever registered at the till.
ALTER TYPE "ImportBatchKind" ADD VALUE IF NOT EXISTS 'SALESPLAY_CUSTOMERS';
