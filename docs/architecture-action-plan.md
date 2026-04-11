# Moja Architecture Action Plan

This plan translates the current review findings into a practical implementation roadmap you can execute incrementally.

## Goals

- unify user experience across Member App and Shop
- improve campaign reliability and scalability
- reduce future maintenance cost in frontend/backend
- preserve security and auditability as traffic grows

## Workstreams

1. **SSO + Ecosystem Identity (Member App -> Shop)**
2. **Campaign Execution Scalability**
3. **Voucher Idempotency & Safety**
4. **Frontend Structure Refactor**
5. **Environment & Release Guardrails**

---

## Phase 0: Baseline and Safety (1-2 days)

### Tasks

- [x] Create feature flags:
  - `FEATURE_SHOP_SSO`
  - `FEATURE_CAMPAIGN_ASYNC`
- [x] Add a rollout checklist template for each release.
- [x] Add basic dashboard metrics placeholders (success/failure counters).

### Deliverables

- feature flags documented
- rollback steps documented

### Acceptance

- team can enable/disable new behavior without redeploying core flows

---

## Phase 1: Shop SSO Handoff (Top Priority)

### Objective

Allow member users to tap Shop and arrive authenticated in shop without manual login.

### Backend (Member Service)

- [x] Add endpoint `POST /auth/shop-handoff`
- [x] Validate member JWT and issue short-lived one-time handoff token (30-60s)
- [x] Include claims: `sub(customerId)`, `aud=shop`, `iss`, `exp`, `jti`
- [x] Store `jti` for replay prevention
- [x] Add audit logs:
  - `shop.handoff.requested`
  - `shop.handoff.issued`

### Backend (Shop Service)

- [x] Add endpoint `GET /sso/consume?handoff=...`
- [x] Validate signature, audience, issuer, expiry, replay
- [x] Create secure HttpOnly session cookie
- [x] Redirect to catalog/home
- [x] On failure, redirect to login with reason code

### Frontend (Member App)

- [x] Replace direct external link with:
  - call handoff endpoint
  - open consume URL
- [x] Add loading state ("Opening Shop...")
- [x] Add user-friendly fallback if SSO fails

### Acceptance

- 95%+ of logged-in users can open Shop without re-login in staging
- invalid/expired handoff never creates shop session

---

## Phase 2: Campaign Async Processing (Scale)

### Objective

Avoid long-running synchronous request path for large campaign pushes.

### Tasks

- [x] Convert `runCampaign` to queue-based flow:
  - API creates `campaignRun` + enqueues job
  - worker processes customer batches
- [x] Add status endpoint:
  - `GET /admin/segments/campaigns/run/:id/status`
- [x] Persist progress fields:
  - matched, processed, success, failed, startedAt, finishedAt
- [ ] Add retry policy and dead-letter handling

### Acceptance

- API returns quickly (<2s) for campaign trigger
- large audience processing continues in background reliably
- progress visible in admin UI

---

## Phase 3: Voucher Idempotency & Duplicate Prevention

### Objective

Ensure repeated campaign runs/retries do not issue duplicate vouchers accidentally.

### Tasks

- [x] Define idempotency identity:
  - `customerId + voucherDefinitionId + campaignRunId` (or equivalent)
- [x] Add DB unique constraint/index
- [x] Update voucher issuance logic to "insert-or-ignore" semantics
- [x] Add conflict logging and summary counters

### Acceptance

- rerun/retry does not duplicate same intended voucher issuance
- metrics show prevented duplicates

---

## Phase 4: Frontend Refactor (Maintainability)

### Objective

Break `client-web/src/App.tsx` into composable modules for long-term scaling.

### Target Structure

- `src/features/auth/*`
- `src/features/overview/*`
- `src/features/vouchers/*`
- `src/features/rewards/*`
- `src/features/profile/*`
- `src/features/shop/*`
- `src/components/*`
- `src/hooks/*`

### Tasks

- [ ] Move API calls into feature hooks
- [ ] Move reusable UI into shared components
- [ ] Keep current behavior unchanged during refactor
- [ ] Add basic smoke tests for main tabs

### Acceptance

- no UX regressions
- significantly smaller root `App.tsx`

---

## Phase 5: Config and Environment Guardrails

### Objective

Prevent runtime surprises due to missing/misplaced env variables.

### Tasks

- [x] Add startup validation for required client env:
  - `VITE_API_BASE_URL`
  - `VITE_SHOP_WEB_URL` (if shop button enabled)
- [x] Add `.env.development`, `.env.staging`, `.env.production` templates
- [x] Add CI check to fail build on missing required env

### Acceptance

- missing critical env fails fast in CI/startup
- no silent broken shop redirection

---

## QA and Test Plan

## Security Tests

- [ ] handoff token expires correctly
- [ ] replayed token is rejected
- [ ] invalid audience/issuer is rejected
- [ ] open redirect attempts are blocked

## Functional Tests

- [ ] member login -> shop opens authenticated
- [ ] campaign run with small and large audience
- [ ] no duplicate voucher issuance on retries

## Regression Tests

- [ ] member app tabs and profile updates still work
- [ ] admin campaign UI still works with summary/guest list

---

## Rollout Strategy

1. Deploy with flags OFF.
2. Enable for internal admins first.
3. Enable for 5% users (shop SSO), monitor.
4. Ramp to 25% / 50% / 100% with checkpoint metrics.
5. Keep rollback flag for at least one release cycle.

---

## Key Metrics to Track

- shop handoff success rate
- shop consume failure reasons
- campaign completion time
- campaign success/failure ratio
- duplicate-prevented count
- member-to-shop conversion rate

---

## Ownership (Suggested)

- **Member Backend**: handoff issuer, campaign orchestration
- **Shop Backend**: consume endpoint, shop session
- **Frontend**: shop opening UX + refactor
- **Data/Infra**: queue, retries, monitoring
- **Security**: token policy review + threat checks

---

## Immediate Next 5 Actions

1. Create tickets for Phase 1 (SSO handoff) backend + frontend.
2. Define final handoff token claim schema and TTL.
3. Stand up a replay store (Redis/table) for `jti`.
4. Prepare staging env values for shop/member domains.
5. Add feature flags and rollout checklist before writing production code.

