# Release rollout checklist

Use this template before enabling new flags in each environment.

## Pre-deploy

- [ ] Migrations applied (`prisma migrate deploy` on member DB; shop SQLite/Postgres for SSO replay if used).
- [ ] `FEATURE_SHOP_SSO`, `FEATURE_CAMPAIGN_ASYNC`, and client `VITE_FEATURE_SHOP_SSO` documented for the target env.
- [ ] `SHOP_WEB_BASE_URL`, `SHOP_HANDOFF_ISSUER`, `SHOP_HANDOFF_JWT_SECRET` (member) and matching `SHOP_HANDOFF_*` (shop) verified.
- [ ] Smoke test: OTP login, Shop button (SSO on/off), one campaign run (sync and async if enabled).

## During rollout

- [ ] Enable flags for internal operators first.
- [ ] Watch `GET /health/metrics` counters (handoff issued/failed, campaign duplicates skipped).
- [ ] Watch audit logs for `shop.handoff.*` and `campaign.run`.

## Rollback

- [ ] Set `FEATURE_SHOP_SSO=false` and `VITE_FEATURE_SHOP_SSO=false` (redeploy client if needed).
- [ ] Set `FEATURE_CAMPAIGN_ASYNC=false` to restore synchronous campaign execution.
- [ ] Confirm shop still opens via direct `VITE_SHOP_WEB_URL` when SSO is off.
