# Rewards/Voucher Workflow V2

This module implements a ZUS-style functional workflow (without copying branding/UI):

- points earned/spent ledger
- reward catalog redeemable by points
- voucher wallet with lock/use/release lifecycle
- gift code redemption to wallet balance
- wallet transaction history
- admin management/reporting endpoints

## Schema Changes

Added Prisma models:

- `rewards_points_ledger` (`RewardsPointsLedger`)
- `reward_catalog` (`RewardCatalog`)
- `user_rewards` (`UserReward`)
- `voucher_campaigns` (`VoucherCampaign`)
- `vouchers` (`Voucher`)
- `voucher_redemptions` (`VoucherRedemption`)
- `gift_voucher_codes` (`GiftVoucherCode`)
- `user_wallet_balance` (`UserWalletBalance`)
- `wallet_transactions` (`WalletTransaction`)

Also added:

- `PaymentIntent.idempotencyKey` for callback-safe processing
- enums for reward/voucher/wallet lifecycle

## Backend APIs

### Member (`JwtAuthGuard`)

- `GET /rewards-wallet/me`
- `POST /rewards-wallet/me/redeem-reward/:rewardCatalogId`
- `POST /rewards-wallet/me/redeem-gift-code`
- `POST /rewards-wallet/me/vouchers/validate-lock`

### Admin (`AdminAuthGuard` + permissions)

- `GET /admin/rewards-workflow/reward-catalog`
- `POST /admin/rewards-workflow/reward-catalog`
- `GET /admin/rewards-workflow/voucher-campaigns`
- `POST /admin/rewards-workflow/voucher-campaigns`
- `POST /admin/rewards-workflow/gift-codes/import`
- `GET /admin/rewards-workflow/user-wallet/:customerId`
- `GET /admin/rewards-workflow/points-ledger`
- `GET /admin/rewards-workflow/wallet-transactions`
- `GET /admin/rewards-workflow/redemption-reports`
- `GET /admin/rewards-workflow/campaign-analytics`

## Checkout Integration

`POST /payments/xendit/shop-order` now accepts:

- `voucherId?: string`
- `idempotencyKey?: string`

Behavior:

1. Validate voucher eligibility (min spend/order type/product/category, expiry, caps).
2. Lock voucher with lock token before payment initiation.
3. On success webhook, finalize redemption and mark voucher `USED`.
4. On payment failure or missing redirect, release lock.

## Frontend Integration

Checkout request now sends:

- `voucherId` (when member selected one)
- `idempotencyKey: crypto.randomUUID()`

## Migration/Application Notes

1. Regenerate Prisma client:
   - `npx prisma generate --no-engine` (works when local query engine file is locked)
2. Apply DB migration in your environment:
   - `npx prisma migrate dev --name rewards_workflow_v2`
   - or use your CI/CD migration workflow.
3. Backfill strategy (optional):
   - hydrate `user_wallet_balance` from existing `stored_wallets` and `loyalty_wallets`.
   - keep legacy tables for coexistence until full cutover.
