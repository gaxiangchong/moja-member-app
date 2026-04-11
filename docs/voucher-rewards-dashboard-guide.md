# Voucher Rewards and Push Guide

This guide explains how admins can:

1. Create a voucher/reward definition.
2. Make it visible in the member rewards catalog (client app).
3. Configure voucher push entitlement rules (newcomer, top-up, referral, etc.).

## Prerequisites

- API server is running (`npm run start:dev`).
- You can access the admin dashboard at `http://localhost:3153/admin-dashboard` (or your configured `PORT`).
- You have an admin API key (`ADMIN_API_KEYS`) or admin JWT login.
- Migrations for voucher rewards/push rules are applied:

```bash
npm run prisma:generate
npm run prisma:migrate
```

## Where to configure in dashboard

In the left menu:

- **Loyalty & rewards -> Rewards catalog**
- **Loyalty & rewards -> Voucher push rules**

## A) Create a reward voucher and show it in client app

Use **Rewards catalog** to create/update a voucher definition with these recommended fields:

- `code`: stable unique code (example: `FREE_DRINK_5`)
- `title`: display name in admin/client
- `description`: redemption details and limitations
- `pointsCost`: points needed to redeem
- `isActive`: master on/off switch
- `imageUrl`: reward image URL (recommended 1:1 or 4:3 image)
- `rewardCategory`: category label (for client grouping/filtering later)
- `showInRewardsCatalog`: must be `true` to show in member rewards catalog
- `rewardSortOrder`: lower value appears first
- `rewardValidFrom`, `rewardValidUntil`: optional catalog visibility window
- `maxTotalIssued`: optional global issuance cap

### Recommended field strategy

- **Availability control**: combine `isActive` + `showInRewardsCatalog` + date window.
- **Soft launch**: keep `showInRewardsCatalog=false` until campaign day.
- **Stock control**: set `maxTotalIssued` for limited releases.
- **Ordering**: reserve sort ranges (10, 20, 30...) for easy insertions.

## B) Configure voucher push entitlement rules

Use **Voucher push rules** to define who should receive a voucher.

Rule fields:

- `name`, `description`
- `isActive`
- `sortOrder`
- `triggerType`
- `triggerConfig` (JSON criteria payload)
- `voucherDefinitionId` (target voucher definition)
- `maxGrantsPerCustomer`
- `cooldownDays`

### How to get `voucherDefinitionId`

Use one of these methods:

1. **From API (quickest)**
   - Call `GET /admin/voucher-definitions`
   - Pick the voucher by `code`/`title`
   - Use its `id` value as `voucherDefinitionId`

Example:

```bash
curl -X GET "http://localhost:3153/admin/voucher-definitions" \
  -H "x-admin-api-key: <YOUR_ADMIN_KEY>"
```

2. **From Dashboard (no API tool needed)**
   - Open **Loyalty & rewards -> Rewards catalog**
   - Click **Edit** on the voucher you want to push
   - The request URL used by save is `PATCH /admin/voucher-definitions/:id`  
     The `:id` there is your `voucherDefinitionId`

Tip: Keep voucher `code` unique and meaningful (for example `WELCOME_DRINK_2026`) so it is easy to map returned `id` to the correct voucher.

Supported trigger types:

- `NEWCOMER`
- `TOPUP_THRESHOLD`
- `REFERRAL`
- `BIRTHDAY`
- `REENGAGEMENT`

### Suggested `triggerConfig` templates

Use JSON with explicit keys so future workers can parse consistently.

#### NEWCOMER

```json
{
  "withinDaysFromSignup": 7,
  "minProfileCompleteness": 0
}
```

#### TOPUP_THRESHOLD

```json
{
  "currency": "SGD",
  "minTopupAmount": 50,
  "windowDays": 30
}
```

#### REFERRAL

```json
{
  "minSuccessfulReferrals": 1,
  "withinDays": 60
}
```

#### BIRTHDAY

```json
{
  "daysBeforeBirthday": 7,
  "validForDays": 14
}
```

#### REENGAGEMENT

```json
{
  "inactiveDays": 45,
  "excludeIfVoucherIssuedInLastDays": 30
}
```

## API reference (if you prefer Postman/cURL)

Admin endpoints:

- `GET /admin/voucher-definitions`
- `POST /admin/voucher-definitions`
- `PATCH /admin/voucher-definitions/:id`
- `GET /admin/voucher-push-rules`
- `POST /admin/voucher-push-rules`
- `PATCH /admin/voucher-push-rules/:id`

Member/client-facing reward list:

- `GET /customers/me/rewards`
- `GET /rewards/voucher-definitions`

### Example: create voucher definition

```bash
curl -X POST "http://localhost:3153/admin/voucher-definitions" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: <YOUR_ADMIN_KEY>" \
  -d '{
    "code": "FREE_DRINK_5",
    "title": "Free Drink (5 Points)",
    "description": "Redeem for one selected drink.",
    "pointsCost": 5,
    "imageUrl": "https://cdn.example.com/rewards/free-drink.png",
    "rewardCategory": "Beverage",
    "showInRewardsCatalog": true,
    "rewardSortOrder": 10,
    "rewardValidFrom": "2026-04-10T00:00:00.000Z",
    "rewardValidUntil": "2026-12-31T23:59:59.000Z",
    "maxTotalIssued": 1000
  }'
```

### Example: create push rule (top-up threshold)

```bash
curl -X POST "http://localhost:3153/admin/voucher-push-rules" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: <YOUR_ADMIN_KEY>" \
  -d '{
    "name": "Top-up 50 in 30 days",
    "description": "Reward members topping up at least SGD 50 in 30 days.",
    "isActive": true,
    "sortOrder": 10,
    "triggerType": "TOPUP_THRESHOLD",
    "triggerConfig": {
      "currency": "SGD",
      "minTopupAmount": 50,
      "windowDays": 30
    },
    "voucherDefinitionId": "<VOUCHER_DEFINITION_ID>",
    "maxGrantsPerCustomer": 1,
    "cooldownDays": 30
  }'
```

## How rewards appear in the client app

A reward appears in client lists when all applicable conditions pass:

- Definition `isActive = true`
- `showInRewardsCatalog = true`
- Current time is within `rewardValidFrom` and `rewardValidUntil` (if set)

Then rewards are sorted by `rewardSortOrder` ascending.

## Important current limitation

Voucher push rules are currently **configurable and stored**, but automatic background execution is not yet enabled in this phase.

That means:

- You can define rules now in dashboard/API.
- A worker/scheduler/event hook is still needed to evaluate these rules and issue vouchers automatically on signup/top-up/referral events.

## Suggested next implementation steps

1. Add event hooks for signup, wallet top-up, and referral completion.
2. Add a voucher-push evaluator service (idempotent and auditable).
3. Add a scheduler for time-based triggers (`BIRTHDAY`, `REENGAGEMENT`).
4. Add execution logs in dashboard (rule run count, success/fail/skipped).
