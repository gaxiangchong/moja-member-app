# Birthday gift — how it works & how to set it up

## What a member gets

A member receives a **birthday gift of loyalty points** (default **150**) **during their birthday month**.

- **Who:** any member who has set their birthday.
- **What:** loyalty points (amount you choose).
- **When:** only during the member's **birthday month**, and **once per calendar year**.
- **Trigger:** granted automatically the next time the member **updates their birthday** or **opens their profile** during their birthday month. No scheduler/cron needed.

> Interpretation note: this is implemented as **150 loyalty points** credited during the birthday month (the points are only given during that month). If you instead wanted a separate "voucher" object (e.g. a wallet voucher code), tell me and I can switch it.

## The flow

```text
Member sets/updates birthday  (Account → Personal info)
        ↓
If the current month = birthday month, and not already gifted this year:
        ↓
Member is credited the birthday points automatically
        ↓
Shows as "Birthday gift" in their points history
```

If the member sets their birthday in a different month, nothing happens then — the gift is granted the next time they open the app **during their birthday month**.

## How to set it up

One setting in the server's `.env` (already added, set to 150):

```bash
# Loyalty points gifted during a member's birthday month (once per year).
# 0 = disabled.
BIRTHDAY_REWARD_POINTS=150
```

Steps:

1. Open `.env` (`d:\GitHub\moja-member-app\.env`).
2. Set `BIRTHDAY_REWARD_POINTS` to the amount you want (e.g. `150`). `0` disables it.
3. **Restart the backend** (`npm run start:dev`).

## How to test

1. Set `BIRTHDAY_REWARD_POINTS=150` and restart the backend.
2. As a member, set your **birthday to a date in the current month** (Account → edit → save).
3. Check your **points history** — a **"Birthday gift"** entry of 150 points appears, and your balance goes up.
4. Save the profile again / reload — you are **not** credited twice (once per year).

## Rules & safeguards

- **Once per year:** guarded by a ledger entry keyed to the year, so reloading the profile or re-saving won't double-credit.
- **Month-gated:** only credited while the current month matches the birthday month.
- **Non-breaking:** if the grant ever fails, profile load/update still works normally.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| No birthday points | `BIRTHDAY_REWARD_POINTS=0`/unset, or backend not restarted | Set the value and restart |
| No points though it's the birthday month | Birthday not set, or already gifted this year | Confirm birthday is saved; check points history for this year's entry |
| Wanted points in a future month | By design only during birthday month | Member will get it automatically when that month arrives and they open the app |

## Where it lives in the code (for reference)

- Logic: `src/customers/customers.service.ts` → `maybeGrantBirthdayReward`, called from `getProfileBundle` (and thus from `updateMe`).
- Reward label in app: `client-web/src/App.tsx` → `humanizeLoyaltyReason` ("Birthday gift").
- Setting: `BIRTHDAY_REWARD_POINTS` in `.env`.

## Summary

1. Set `BIRTHDAY_REWARD_POINTS=150` in `.env`, restart the backend.
2. Members with a birthday in the current month are credited 150 points automatically, once per year, when they next open the app.
