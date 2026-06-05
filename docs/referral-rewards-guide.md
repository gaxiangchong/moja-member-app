# Referral rewards — how it works & how to set it up

## What a member gets for referring a friend

When a member shares their invite link and a **new friend signs up and completes their first paid order**, the **referrer earns loyalty points** automatically.

- **Who gets rewarded:** the **referrer** (the existing member).
- **What they get:** **loyalty points** (amount you choose).
- **When:** after the **referred friend's first paid order** (not at signup — this prevents abuse from fake signups).
- The friend (new member) gets the normal welcome/earning, but no special referral bonus.

## The flow

```text
Member shares invite link  (app → "Share app & invite", link looks like  …/?ref=ABC12345)
        ↓
Friend opens link, signs up (OTP + PIN)        → friend tagged as "referred by" this member
        ↓
Friend places & PAYS for their first order      → referrer automatically gets points
        ↓
Referrer sees "Referral reward" in points history, and "My Referrals" count goes up
```

Notes:
- Each referrer is rewarded **once per referred friend** (no double rewards, even if the webhook retries).
- If referral rewards are turned off, referrals are still **tracked** (the count still shows) — there's just no automatic points.

## How to set it up

The reward amount is controlled by one setting in the server's `.env` file:

```bash
# Points given to the referrer when their referred friend completes a first paid order.
# 0 = disabled. Set any whole number to enable.
REFERRAL_REWARD_POINTS=100
```

Steps:

1. Open `.env` in the project root (`d:\GitHub\moja-member-app\.env`).
2. Set `REFERRAL_REWARD_POINTS` to the amount you want (e.g. `100`).  
   - To **turn it off**, set it to `0` or remove the line.
3. **Restart the backend** (`npm run start:dev`) so the new value is loaded.

That's the whole setup — no admin screen needed.

## How to test

1. Make sure `REFERRAL_REWARD_POINTS` is set (e.g. `100`) and the backend is restarted.
2. As **Member A**, open the app → **Account / Invite** → copy the invite link (`…/?ref=CODE`).
3. In a different browser/device, open that link and sign up as **Member B** (new phone number).
4. As **Member B**, add items to cart and **complete a paid order**.
5. Check **Member A**:
   - Points balance increased by `REFERRAL_REWARD_POINTS`.
   - Points history shows a **"Referral reward"** entry.
   - **My Referrals** count shows the new friend.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| Referrer got no points | `REFERRAL_REWARD_POINTS` is 0/unset, or backend not restarted | Set the value and restart the backend |
| Still no points | Friend's order wasn't actually **paid**, or it wasn't their **first** paid order | Reward only fires on the friend's first successful payment |
| Friend not linked to referrer | Friend didn't sign up via the `?ref=` link, or already had an account | Referral attribution only happens on first signup via the invite link |
| Points given twice | Not possible by design | Each referrer is rewarded once per referred friend (ledger-guarded) |

## Where it lives in the code (for reference)

- Reward logic: `src/customers/customers.service.ts` → `finalizeShopOrderAfterPayment` → `maybeRewardReferrerOnFirstOrder`
- Triggered after payment: `src/payments/payments.service.ts` (on successful payment webhook)
- Reward label in app: `client-web/src/App.tsx` → `humanizeLoyaltyReason` ("Referral reward")
- Setting: `REFERRAL_REWARD_POINTS` in `.env`

## Summary

1. Set `REFERRAL_REWARD_POINTS=100` (or your amount) in `.env`, restart the backend.
2. Members share their invite link.
3. When a referred friend completes their **first paid order**, the referrer **automatically** gets the points.
