# Points-redeem rewards (RM5 / RM10) — simple **All series** setup

This is the **simple** way to let members **spend points** for a **cash discount at checkout** (e.g. **RM5 off**, **RM10 off**).

**You only use one screen: `Vouchers & Rewards → All series`.**  
No Automation. No Perks campaign. You set the discount **directly on the series** and it applies in the member app immediately.

Admin UI: open **`/admin-dashboard`** → sign in → sidebar **Vouchers & Rewards**.

---

## The whole idea in one line

```text
Create a series (points cost + RM discount) in "All series"  →  member redeems with points  →  RM off at checkout
```

Each series carries everything it needs:

| On the series | Meaning |
|----------------|---------|
| **Points cost** | How many points the member spends |
| **Checkout discount (RM)** | The flat RM taken off the order |
| **Min. order spend (RM)** *(optional)* | Minimum subtotal before the discount applies |
| **Show in member rewards catalog** | Makes it visible under **Perks → Rewards** |
| **Series active** + valid dates | Controls availability |

---

## Full example: **RM5 off** for **1,000 points**

### 1. Create the series

1. **Vouchers & Rewards** → tab **New series**.
2. **Step 1 — Basics**
   - **Series name:** `RM5 off your order`
   - **Internal code:** `POINTS_RM5_OFF`
   - **Description (optional):** `Redeem 1,000 points for RM5 off. Min. spend RM20.`
   - **Where should this appear?** Choose **Points catalog reward**.
3. **Continue** → **Step 2 — Schedule**
   - **Valid from / until:** e.g. `2026-06-01` → `2027-12-31`
   - **Points price:** `1000`
4. **Continue** → review → **Create series**.

### 2. Set the discount (this is the key step)

1. Tab **All series** → **Refresh** → find `POINTS_RM5_OFF` → click **Edit** (pencil).
2. Fill in:

| Field | Value |
|--------|-------|
| **Points cost** | `1000` |
| **Checkout discount (RM)** | `5.00` |
| **Min. order spend (RM)** | `20.00` *(optional; leave empty for no minimum)* |
| **Show in member rewards catalog** | ✅ checked |
| **Series active** | ✅ checked |

3. Click **Save changes**.

That's it — the row now shows `1000 · RM5.00 off`. **No campaign needed.**

### 3. What the member sees

1. **Perks → Rewards** → card **RM5 off your order** (1,000 pts).
2. Tap **Redeem voucher** → **OK, go to Shop**.
3. Add products → **Checkout**.
4. Under **Voucher or reward**, pick the RM5 reward (needs ≥ 1,000 points and subtotal ≥ RM20 if you set a minimum).
5. **Order summary** shows **Discount −RM5.00**.

Points are deducted when the order is **paid**.

---

## Second reward: **RM10 off**

Repeat the same two steps with different numbers:

| Field | RM5 | RM10 |
|--------|-----|------|
| Internal code | `POINTS_RM5_OFF` | `POINTS_RM10_OFF` |
| Points cost | `1000` | `2000` *(your choice)* |
| Checkout discount (RM) | `5.00` | `10.00` |
| Min. order spend (RM) | `20.00` *(optional)* | `40.00` *(optional)* |

---

## Field reference (All series → Edit)

| Field | Required? | Notes |
|--------|-----------|-------|
| **Points cost** | Yes | Points the member spends (≥ 1) |
| **Checkout discount (RM)** | Yes (for RM off) | Flat amount off the order. Stored in sen automatically. |
| **Min. order spend (RM)** | Optional | Subtotal must reach this for the discount to apply |
| **Show in member rewards catalog** | Yes | Must be on to appear under **Perks → Rewards** |
| **Series active** | Yes | Uncheck to hide without deleting |
| **Valid from / until** | Recommended | Hidden outside the window |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Reward not under **Perks → Rewards** | In **Edit**: turn on **Show in member rewards catalog** + **Series active**, set valid dates and **Points cost** |
| Discount shows **RM0** at checkout | In **Edit**: set **Checkout discount (RM)** to `5.00` / `10.00` and **Save** |
| "Minimum order RM…" message | Increase cart subtotal or lower **Min. order spend (RM)** |
| "Not enough points" | Lower **Points cost** or top up the member's points |

After admin changes, members may need to re-open **Perks** / **Shop** to refresh.

---

## Note on the old "Automation / Perks campaign" path

You no longer need it for point-redeem discounts. The discount now lives on the series itself.  
The **Automation** tab still exists for advanced auto-grant campaigns; if a series has **no** discount of its own, the system will still fall back to an active perks-campaign rebate. For your RM5/RM10 points rewards, just use **All series** as above.

---

## Summary

1. **New series** → Points catalog reward (set name, code, points price, dates).
2. **All series → Edit** → set **Checkout discount (RM)** (and optional **Min. order spend**) → **Save**.
3. Member redeems from **Perks → Rewards** and applies it at **Shop → Checkout**.

Two fields, one screen — done.
