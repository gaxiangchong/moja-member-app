# Moja Ecosystem Plan: Member App + Shop SSO

## Objective

Build a seamless and secure shopping experience where logged-in members from the Moja Member App can open the Shop without re-authentication, while keeping profile, vouchers, loyalty points, and order activity synchronized across systems.

## Problem Statement

Current flow opens the Shop in a separate browser context and does not carry member identity/session. This causes:

- fragmented user experience
- repeated login prompts
- broken personalization and loyalty continuity
- weaker conversion in shop flow

## Target Architecture

Use one shared member identity domain and a secure **Shop Session Exchange (SSO handoff)**:

1. Member App user is authenticated via member JWT.
2. Member App calls backend to request one-time shop handoff token.
3. Member App opens Shop consume endpoint with handoff token.
4. Shop validates handoff token server-side.
5. Shop creates HttpOnly session cookie and redirects to catalog.
6. Member context resolves to same `customerId` in all systems.

## Design Principles

- Seamless UX: max one click to shop.
- Security first: no long-lived token in URL.
- Single customer identity across all channels.
- Auditable and observable auth handoff.
- Backward-compatible rollout with safe fallback.

## Scope

### In Scope

- secure SSO handoff flow from member app to shop
- session creation in shop
- unified customer identity mapping
- event-level data synchronization strategy
- rollout plan, metrics, and guardrails

### Out of Scope (for first rollout)

- full account center redesign
- full role/permission unification with admin users
- deep checkout redesign

## Proposed Flows

### A) Happy Path (Member App -> Shop)

1. User taps Shop in member app.
2. App requests handoff token from member backend.
3. App opens `https://shop.<domain>/sso/consume?handoff=<token>`.
4. Shop backend verifies token and creates shop session.
5. User lands directly in product catalog, logged in.

### B) Fallback Path

If consume fails (expired/invalid token):

- redirect to shop login page with user-friendly message
- preserve intended destination path if possible

## Technical Components

## 1) Member Backend: Handoff Endpoint

Add endpoint (example):

- `POST /auth/shop-handoff`

Behavior:

- require authenticated member JWT
- issue one-time short-lived handoff token (30–60s)
- include `customerId`, `aud=shop`, `jti`, `exp`, `iss`
- persist `jti` (or nonce) for replay prevention
- return prebuilt consume URL or token only

## 2) Shop Backend: Consume Endpoint

Add endpoint (example):

- `GET /sso/consume?handoff=...`

Behavior:

- verify signature, issuer, audience, expiry
- reject replayed `jti`
- lookup or create local shop user mapped to `customerId`
- create HttpOnly secure session cookie
- redirect to shop home/catalog

## 3) Session Model

Shop should use cookie session:

- HttpOnly: true
- Secure: true (prod)
- SameSite: Lax (default)
- short access session + optional refresh strategy

## 4) Shared Identity Mapping

Canonical key:

- `customerId` (from member system)

Shop profile linkage:

- `shop_user.customerId` unique constraint

## API Contract Draft

## `POST /auth/shop-handoff`

Request:

- Auth: `Bearer <member_jwt>`

Response (example):

```json
{
  "handoffToken": "<jwt_or_nonce_token>",
  "expiresInSec": 45,
  "consumeUrl": "https://shop.moja.com/sso/consume?handoff=<token>"
}
```

Failure:

- `401` unauthenticated
- `429` too many requests
- `500` server error

## `GET /sso/consume`

Query:

- `handoff=<token>`

Behavior:

- on success: set session cookie and redirect `302 /catalog`
- on failure: redirect `302 /login?reason=sso_failed`

## Security Checklist (Mandatory)

- one-time token with `jti`
- token expiry <= 60 seconds
- strict `aud` and `iss` validation
- replay protection store
- no long-lived access token in query string
- sanitize and allowlist redirect targets
- CSRF protection on state-changing shop APIs
- rate limiting on handoff and consume endpoints
- audit logging for all handoff attempts/failures

## Observability and Audit

Track metrics:

- handoff request count
- handoff success rate
- consume success/failure by reason
- time-to-shop landing
- shop conversion from member app entry

Log events:

- `shop.handoff.requested`
- `shop.handoff.issued`
- `shop.handoff.consumed`
- `shop.handoff.failed`

## Data Synchronization Strategy

Event-driven sync (recommended):

- `order.completed` -> loyalty accrual
- `voucher.redeemed` -> voucher status update
- `reward.redeemed` -> points deduction

Rules:

- idempotency key per event
- retry queue + dead-letter handling
- reconciliation job (daily)

## Rollout Plan

## Phase 1: SSO Foundation (1–2 sprints)

- implement handoff endpoint (member backend)
- implement consume endpoint (shop backend)
- wire member app shop button to handoff flow
- add logs and baseline metrics

Deliverable:

- one-click shop open with auto-login

## Phase 2: Loyalty and Voucher Continuity

- connect order/voucher/reward events
- update points and vouchers near real-time
- add reconciliation dashboard

Deliverable:

- consistent points/voucher state across app and shop

## Phase 3: Optimization

- personalization based on member tier/history
- conversion analytics by segment
- unified account preferences

Deliverable:

- optimized, data-driven ecosystem experience

## UX Guidelines

- show "Opening Shop..." loading state on tap
- never expose raw technical errors to user
- fallback gracefully if popup blocked (same-window redirect)
- preserve confidence: avoid forced re-login in happy path

## Risks and Mitigations

- **Replay attacks** -> one-time token + jti store
- **Env misconfiguration** -> startup env validation + health checks
- **Cross-domain cookie issues** -> test per environment and use same-site policy intentionally
- **Event drift** -> idempotency + reconciliation jobs

## Execution Checklist

- [ ] Define auth domains and envs (`dev`, `staging`, `prod`)
- [ ] Implement `/auth/shop-handoff` in member backend
- [ ] Implement `/sso/consume` in shop backend
- [ ] Add replay protection store
- [ ] Wire member app shop button to handoff endpoint
- [ ] Add fallback route and UX copy
- [ ] Add logs + dashboards
- [ ] Run security test cases (expiry, replay, tampering)
- [ ] UAT with real customer journeys
- [ ] Gradual rollout with feature flag

## Suggested Ownership

- Backend (Member): handoff issuance and audit
- Backend (Shop): consume, session creation, profile linkage
- Frontend (Member): handoff trigger and UX fallback
- Frontend (Shop): post-SSO landing and customer context
- DevOps/SRE: env setup, secret management, observability
- Product/CRM: campaign and loyalty acceptance criteria

