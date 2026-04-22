<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## WhatsApp OTP setup guide

This project supports phone login with OTP delivered via WhatsApp. Two providers
are supported, selected with `WHATSAPP_PROVIDER`:

- `meta` (default) — Meta WhatsApp Cloud API (Graph API)
- `twilio` — Twilio Programmable Messaging on the WhatsApp channel

### 1) Configure environment variables

Set these in `.env` (pick **one** provider):

```env
# OTP delivery mode: auto | mock | whatsapp
OTP_DELIVERY_MODE=whatsapp
# Optional fixed code for mock mode
OTP_MOCK_FIXED_CODE=123456

# CORS for client web app
CLIENT_WEB_ORIGIN=http://localhost:5193

# --- Provider selector ---
WHATSAPP_PROVIDER=twilio   # or `meta`

# --- Meta WhatsApp Cloud API (when WHATSAPP_PROVIDER=meta) ---
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_GRAPH_API_VERSION=v21.0
WHATSAPP_OTP_TEMPLATE_NAME=
WHATSAPP_OTP_TEMPLATE_LANG=en

# --- Twilio WhatsApp (when WHATSAPP_PROVIDER=twilio) ---
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
# Sender: pick ONE of the two
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
# TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Optional pre-approved Content template (production). {{1}} = OTP code.
# TWILIO_WHATSAPP_CONTENT_SID=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Notes:
- If WhatsApp credentials for the selected provider are present, OTP is sent over WhatsApp.
- In production, if WhatsApp is not configured, OTP request returns `OTP_DELIVERY_NOT_CONFIGURED` (503).
- In development without WhatsApp config, API returns `_devCode` for testing.
- `OTP_DELIVERY_MODE=mock` always returns `_devCode` and does not call WhatsApp.
- `OTP_DELIVERY_MODE=whatsapp` enforces WhatsApp config and fails fast if not configured.
- `OTP_DELIVERY_MODE=auto` uses WhatsApp when available, otherwise falls back to dev/mock response.

### 1.1) Local PostgreSQL (recommended for dev)

Use local DB in `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/moja_member?schema=public"
```

Then run:

```bash
npm run prisma:generate
npm run prisma:migrate
```

If migration succeeds, your local DB is ready.

### 2a) Meta WhatsApp Cloud API prerequisites

In Meta Developer console:
- Create/select an app with WhatsApp product enabled.
- Get a permanent `WHATSAPP_ACCESS_TOKEN`.
- Copy your `WHATSAPP_PHONE_NUMBER_ID`.
- Add recipient numbers to allowed/test recipients (if still in test mode).
- (Recommended for production) create and approve a message template for OTP.

### 2b) Twilio WhatsApp prerequisites

In the [Twilio Console](https://console.twilio.com):
- Grab your **Account SID** and **Auth Token** from the dashboard → `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`.
- **Development (Sandbox)**: open **Messaging → Try it out → Send a WhatsApp message** and note the sandbox number (usually `+14155238886`). Every test phone must first send the join code (e.g. `join hello-world`) from their WhatsApp to that number. Then set `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886`.
- **Production**: register a WhatsApp Sender under **Messaging → Senders → WhatsApp Senders**. Once approved, set `TWILIO_WHATSAPP_FROM=whatsapp:+<your-approved-number>` — or put the sender in a Messaging Service and use `TWILIO_MESSAGING_SERVICE_SID=MG...` instead.
- **Production templates**: WhatsApp requires a pre-approved template for business-initiated messages. Create one under **Messaging → Content Template Builder** with a single variable `{{1}}` (the OTP code), get it approved by Meta, and put its SID in `TWILIO_WHATSAPP_CONTENT_SID=HX...`. Plain-text `Body` only works inside the 24h customer-reply window or in the Sandbox.

### 3) Template vs plain text behavior

- **Meta**: set `WHATSAPP_OTP_TEMPLATE_NAME` to use template mode (`{{1}}` = code); otherwise plain text is sent.
- **Twilio**: set `TWILIO_WHATSAPP_CONTENT_SID` to use a Content template (`{{1}}` = code); otherwise plain text is sent.

For production accounts on either provider, an approved template is required by WhatsApp policy.

### 4) Test flow

1. Start API:
   ```bash
   npm run start:dev
   ```
2. (Twilio Sandbox only) From your phone, WhatsApp the join code to `+14155238886` once.
3. Request OTP:
   - `POST /auth/otp/request`
   - body: `{ "phone": "+65XXXXXXXX" }`
4. Verify OTP:
   - `POST /auth/otp/verify`
   - body: `{ "phone": "+65XXXXXXXX", "code": "123456" }`

### 5) Troubleshooting

- **No message received (Meta)**
  - Confirm `WHATSAPP_ACCESS_TOKEN` is valid and not expired.
  - Confirm phone is in correct international format.
  - Confirm recipient is allowed (sandbox/test mode).
- **No message received (Twilio)**
  - Confirm `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` are from the same project.
  - In Sandbox mode, confirm the recipient has sent the join code to `+14155238886`.
  - In production, confirm the sender is WhatsApp-approved and either `TWILIO_WHATSAPP_FROM` or `TWILIO_MESSAGING_SERVICE_SID` is set.
  - Outside the 24h window, a `TWILIO_WHATSAPP_CONTENT_SID` (approved template) is required.
- **API error from WhatsApp**
  - Check server logs (`WhatsappOtpService`) for the provider response body.
  - Meta: verify Graph API version and `WHATSAPP_PHONE_NUMBER_ID`.
  - Twilio: check **Monitor → Logs → Messaging** in the Console for the error code.
- **Frontend blocked by CORS**
  - Add your web origin to `CLIENT_WEB_ORIGIN` (comma-separated supported).

## Back-office admin system (design)

This section describes the target architecture for the F&B member **admin / back-office**. The API is NestJS + Prisma; the embedded UI is at `GET /admin-dashboard` (Phase 1-style shell; full SPA can replace it later).

### Design principles

1. **Wallet credit and loyalty points are separate**  
   - **Stored wallet credit** (money-like, cents): balance + lifetime aggregates on `stored_wallets`, **append-only** ledger on `stored_wallet_ledger_entries` (`WalletTxnType`: top-up, spend, refund, manual adjustment, promotional bonus, reversal).  
   - **Loyalty points**: balance cache on `loyalty_wallets`, ledger on `loyalty_ledger_entries`. No mixing of cents and points in one ledger.

2. **Ledger-first money and points**  
   Every change is a new row (balance before/after for wallet). Reversals are **compensating entries**, not silent edits.

3. **Audit everything sensitive**  
   Customer PII changes, wallet/points adjustments, imports/exports, campaign runs, and admin-driven voucher pushes should emit `audit_logs` (actor, action, entity, metadata).

4. **Imports are batched and reviewable**  
   Upload → validate → **preview** → **commit**; persist batch metadata, row-level errors, and optional stored upload file under `data/imports/`.

5. **Segmentation drives campaigns**  
   Filters are JSON (saved audiences + ad-hoc preview). Campaign execution records a `campaign_run` and applies actions in bulk (voucher push, wallet bonus, points bonus). Delivery channels (WhatsApp/SMS/email/in-app) are **outbound adapters** to add later.

### Logical architecture

```mermaid
flowchart TB
  subgraph admin_ui [Admin UI]
    Dash[Dashboards and reports]
    CRM[Customer CRM]
    Vouchers[Voucher ops]
    Wallet[Wallet ops]
    Points[Points ops]
    ImpExp[Import / Export]
    Seg[Segments and campaigns]
    Master[Master data]
  end

  subgraph api [Nest API]
    AdminCtrl["/admin/*"]
    SegCtrl["/admin/segments/*"]
    IO["/admin/import/* /admin/export/*"]
    MasterCtrl["/admin/master/*"]
  end

  subgraph core [Domain services]
    Customers[Customers]
    WalletSvc[WalletService]
    LoyaltySvc[LoyaltyService]
    SegSvc[SegmentationService]
    IOSvc[ImportExportService]
  end

  subgraph data [PostgreSQL]
    C[(customers)]
    SW[(stored_wallets + ledger)]
    LW[(loyalty_wallets + ledger)]
    CV[(customer_vouchers)]
    VD[(voucher_definitions)]
    Aud[(audit_logs)]
    SegA[(segment_audiences)]
    Camp[(campaign_runs)]
    Imp[(import_batches)]
    Exp[(export_jobs)]
    Mas[(master_entries + business_rules)]
  end

  admin_ui --> api
  api --> core
  core --> data
```

### Role-based access control (target)

**Today:** admin routes are protected by **`x-admin-api-key`** (`AdminApiKeyGuard`). Optional env: `ADMIN_ALLOW_PHONE_CHANGE` for stricter phone edits.

**Target:** replace or supplement API keys with **admin JWT** (or SSO) and a permission matrix, for example:

| Permission | Examples |
|------------|----------|
| `customers.read` | List/search profile, audit read |
| `customers.write` | Edit profile, tags, status |
| `customers.phone_change` | Change phone (higher risk) |
| `wallet.read` / `wallet.adjust` / `wallet.freeze` | View ledger, manual credit/debit, freeze |
| `loyalty.read` / `loyalty.adjust` | Ledger view, manual points |
| `vouchers.define` / `vouchers.assign` | Definitions vs issue to member |
| `segments.manage` / `campaigns.run` | Saved audiences vs execute campaigns |
| `import.export` | Upload, commit import, run export |
| `master.manage` | Tiers, stores, rules |
| `reports.view` | Dashboards and exports |

Implement as Nest **guards** + decorators checking claims; map roles (e.g. `support`, `marketing`, `finance`, `superadmin`) to permission sets.

### Module map (API surface)

| Area | Responsibility | Main routes (prefix `admin` unless noted) |
|------|------------------|-------------------------------------------|
| **CRM** | Search, profile, tags, audit trail | `GET/PATCH /admin/customers…`, `GET …/audit-logs` |
| **Wallet** | Credit separate from points, freeze, reversal | `GET …/wallet`, `POST …/wallet/adjustments`, `POST …/wallet/reverse/:txn`, freeze/unfreeze |
| **Loyalty** | Points ledger and adjustments | `POST …/loyalty/adjustments`, `GET /admin/loyalty-ledger` |
| **Vouchers** | Definitions + issue (single/campaign/import) | `GET/POST /admin/voucher-definitions`, assignments via campaign/import |
| **Segmentation & campaigns** | Filters, saved audiences, bulk actions | `/admin/segments/*`, `POST …/campaigns/run` |
| **Import / export** | CSV/XLSX, preview, commit, jobs | `/admin/import/*`, `/admin/export/*` |
| **Master data** | Tiers, stores, channels, rules | `/admin/master/*`, `POST …/seed` |
| **Reporting** | KPIs and activity feeds | `GET /admin/overview`, ledger endpoints, export jobs |

### Reporting dashboards

- **Operational:** member counts, signups, points issued/redeemed, wallet top-ups (from wallet ledger), voucher statuses, recent registrations / voucher / wallet activity (`/admin/overview`).  
- **Deep-dive:** filtered exports and segment counts; future: scheduled reports, reconciliation (wallet sum vs ledger), campaign funnel.

### Campaign delivery (future)

Keep **campaign execution** (who gets what) in the core service; add a **delivery queue** and channel workers (WhatsApp, SMS, email, push) that consume `campaign_run` or notification jobs. Template rendering and consent flags live next to channel adapters.

### Environment (admin-related)

```env
ADMIN_API_KEYS=comma-separated-keys
ADMIN_ALLOW_PHONE_CHANGE=false
```

Local import/export files default under `data/` (gitignored).

---

For implementation details and client integration, trace controllers under `src/admin/`, `src/segmentation/`, `src/import-export/`, `src/master-data/`, and `src/ui/admin-dashboard.controller.ts`.

### Voucher rewards and push setup

See `docs/voucher-rewards-dashboard-guide.md` for:

- How to create reward vouchers in the dashboard.
- How to configure voucher push entitlement rules (newcomer/top-up/referral/etc.).
- How rewards appear in the client app.

Sidebar visibility and the member **Shop** product list are documented there as well (`admin-dashboard.config.json`, `GET /shop/catalog/products`).

## Deployment

For a step-by-step runbook (API, PostgreSQL / Prisma, `client-web`, `ops-queue-web`, CORS, env vars, health checks, and rollback), see **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. Feature-flag and shop SSO rollout steps are in **[docs/rollout-checklist.md](docs/rollout-checklist.md)**.

Generic NestJS hosting notes: [NestJS deployment](https://docs.nestjs.com/deployment).

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
