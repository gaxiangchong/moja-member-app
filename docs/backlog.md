# Loyalty & rewards backlog

Items found while running the end-to-end loyalty journey (`scripts/loyalty-journey.mjs`). Features that already work stay as they are; this list covers what is missing or only half wired.

## 1. Gift a voucher to friends and family — not built

**Use case:** a member buys a voucher (or coupon) and sends it to a friend or family member, who then uses it at checkout.

Today members can only earn or redeem vouchers into their own wallet. The pieces that exist:

- Campaign vouchers (`vouchers` table) are tied to one `customerId`, with no transfer.
- Admin-imported gift codes (`POST /admin/rewards-workflow/gift-codes/import`) credit the stored-money wallet when a member enters the code (`POST /rewards-wallet/me/redeem-gift-code`). They are not bought by members.

Scope to build:

- A "gift voucher" product: fixed values (e.g. RM30 / RM50 / RM100), paid through Xendit like a shop order.
- Recipient by phone number. An existing member receives the voucher in their wallet. A new number gets a WhatsApp or SMS invite and claims it after signing up.
- Optional message from the sender, and a "sent / claimed" state in the sender's history.
- Rules: expiry, whether it can be refunded, and whether a member can forward an unused voucher they earned.
- Admin view of gifts sold, claimed, and outstanding (this is a liability for finance).

## 2. "Bonus campaigns" screen is a placeholder

Loyalty & rewards → Bonus campaigns in the legacy dashboard shows a "future release" notice. Bonus campaigns that work today are created under Loyalty & rewards → **Vouchers** using a template (Welcome, Birthday, Referral, Spend & earn, Win-back). These issue automatically inside the campaign dates and skip campaigns that have not started; the journey test covers this.

Separately, the older perks campaign rules API (`/admin/perks-campaign-rules`) stores rules such as "single purchase over RM X" but nothing evaluates them to issue vouchers; they only supply rebate values for points-catalog items. Decide whether to remove that API or connect it to the same automation, and either build the Bonus campaigns page or hide it from the menu.

## 3. Wallet top-up campaign trigger

`WALLET_TOPUP` is accepted when creating a campaign but no code fires it after a top-up, so those campaigns never issue.

## 4. Referral and birthday points are off unless configured

- `REFERRAL_REWARD_POINTS` and `BIRTHDAY_REWARD_POINTS` default to 0, which means no points. The member app promises "500 pts per friend who joins", so production needs `REFERRAL_REWARD_POINTS=500` (and a birthday amount), or the copy should read the configured value.
- The referrer is rewarded on the friend's first paid order. The friend receives nothing specific to the referral, only the general new-member campaigns.

## 5. Birthday vouchers only on the exact day

The birthday voucher campaign runs once a day at 9 AM and only matches members whose birthday is that day. A member who adds their birthday later in the month, or a day when the server was down, is missed. Birthday points already use the whole birthday month; vouchers could do the same.

## 6. Automated coverage

`scripts/loyalty-journey.mjs` runs against a live local API and database. Wiring it (or an equivalent Jest e2e suite) into CI would catch regressions in earning, redemption, and checkout discounts automatically.
