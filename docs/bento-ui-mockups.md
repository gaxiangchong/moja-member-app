# Bento Web UX Mockups

## Goal
Create a more modern, user-friendly Bento experience for both individual buyers and organizations, while preserving the existing login flow and keeping the MVP safe.

The mockups here are mobile-first, clean, card-based, and emphasize clarity for choosing a subscription, ordering meals, and managing billing.

---

## 1. Login / Account Selection (keep existing flow)

### Current requirement
- Do not change the existing login screen.
- Add an option for user to choose Individual or Organization.

### Recommended layout
- Keep the current brand card, logo, and phone number flow.
- Add a small selector above the phone field:
  - `Continue as:`
    - `Individual` (default)
    - `Organization`
- Show a subtle help line under Organization:
  - `For teams, offices, or group subscriptions. Create one organization account and invite members.`
- When Organization is selected, show a secondary action:
  - `Preview organization onboarding`

### Why this works
- Minimal disruption to current users.
- Gives the group option without forcing it.
- Helps users choose the right path before they start.

---

## 2. Organization Onboarding Mockup

### Stepper card
- A small progress bar with 3 steps:
  1. Organization details
  2. Invite members
  3. Billing preferences

### Step 1: Organization details
- Fields:
  - Organization name
  - Billing contact email
  - Billing phone (optional)
- Good mobile UX:
  - single-column card
  - `Continue` CTA at bottom
  - secondary `Back` / `Cancel` button

### Step 2: Invite members
- Text area or tokenized email input
- Example helper text:
  - `Invite your team to join with email addresses. Members can order from the shared plan.`
- Add a note: `You can invite later if you prefer.`

### Step 3: Billing preferences
- Options:
  - `Credit card payment` (default)
  - `Invoice / PO support`
- Show a small preview text:
  - `Invoices are sent to the billing contact.`
- Final button: `Finish setup`

---

## 3. Order Home (main screen)

### Header
- Title: `Order Bento`
- Subtitle line with friendly greeting or current plan summary:
  - `You have 3 lunches left this week.`

### Summary card
- Card at top showing:
  - Current plan name
  - `Next delivery:` date
  - `Subscription type:` Individual or Organization
  - `Team seats:` 5 / 10 (if org)
- Use icon chips for status (active, paused, pending billing)

### Package selector
- Replace dense grid with wider cards or horizontal scroll.
- Each card should include:
  - Package title
  - Price badge
  - Highlighted features: `5 meals`, `Pickup every weekday`, `Healthy menu`
- Selected card should have a strong outline and `Selected` badge.

### Meal choice section
- Use a clean segmented control for `Lunch / Dinner / Both`.
- Show options with icons and brief labels.
- Each variant group should appear as a card or tile.

### Sticky order summary
- On mobile, pin a small footer summary when the user scrolls.
- Footer includes selected package, total price, `Order now` CTA.

---

## 4. Checkout / Confirmation

### Better flow
- Keep checkout simple:
  - Summary of chosen package and meal selections.
  - Clear `Total` and `Next delivery date`.
  - If organization: show `Billing entity: [Organization name]` and `Invoice to: [billing email]`.

### Suggested screen blocks
- `Your order` card
- `Delivery / pickup` card
- `Billing` card (organization only)
- `Payment` CTA button

---

## 5. My Bento / Subscription Management

### Card-based subscription view
- Each subscription should be one expandable card.
- Card header includes:
  - Subscription name
  - Status pill (`Active`, `Pending payment`, `Paused`)
  - Next pickup date
- Expanded content:
  - Delivery days, menu summary, credits remaining.
  - Action buttons: `Edit schedule`, `Order again`, `Pause`.

### For organizations
- Add a banner at the top:
  - `Organization dashboard` with `Billing`, `Members`, and `Seats` quick links.
- Provide a summary row:
  - `Members invited`, `Active seats`, `Available seats`.

---

## 6. Account / Organization Dashboard

### Individual account view
- Simple profile form with fields: Name, Email, Birthday, Phone.
- `Logout` button.

### Organization account view
- Organization info card:
  - Org name, billing contact, invoice preference.
- Member list card:
  - `Owner`, `Admin`, `Member` roles.
  - Invite button.
- Billing card:
  - `Payment method`, `Next invoice`, `Recent invoices`.

### Visual clarity
- Use light section cards with subtle shadows.
- Keep form fields full-width.
- Use consistent secondary text and spacing.

---

## 7. UI Tone & Copy

### Recommended tone
- Friendly and clear.
- Avoid native mobile cruft like raw selects or plain buttons.
- Prefer `card + badge + chip` combinations.

### Example copy improvements
- `Continue as` instead of `Individual / Organization` alone.
- `Order Bento` instead of `Order` for main tab.
- `My Bento` stays good for personal subscription summary.
- `Billing` tab label could become `Organization` only when org selected.

---

## 8. Interaction details

### Organization option behavior
- Default to Individual for existing users.
- If Organization selected, show explanation text.
- Only ask for organization details after the user continues with phone verification.

### Error / validation
- Show inline validation messages directly below each field.
- Use red text for errors and green for confirmations.
- Maintain current OTP flow, but with clearer step headings and progress.

### Accessibility
- Larger tap targets for radio options.
- Ensure labels are linked to inputs.
- Maintain high contrast for CTAs.

---

## 9. Suggested design pattern

Use the following pattern across the app:

- `Card` containers with soft border and light background.
- `Primary CTA` buttons with strong orange gradient.
- `Secondary CTA` buttons with border and subtle background.
- `Status pills` for active / pending / failed states.
- `Chip` UI for small metadata (seats, delivery days, dietary preferences).

---

## 10. Next step for implementation

If you want, I can now:
1. Convert these mockups into concrete React component sketches for `bento-web`.
2. Build a polished `Order Home` screen in JSX/CSS.
3. Build an `Organization onboarding` flow that matches these mockups.
