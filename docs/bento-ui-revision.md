Bento UI Revision — Proposal

Goal
- Improve UX of `bento-web` while preserving existing `moja-member-app` behavior.
- Add minimal Organization support (choice at auth) without breaking current flows.

Guiding principles
- Keep existing login flow intact (additive changes only).
- Mobile-first, high-contrast CTA, clear affordances, accessible forms.
- Progressive disclosure: surface org features only when chosen.

Immediate code change (implemented)
- Added Individual / Organization radio selector to `AuthScreens` (phone step).
  - File: [bento-web/src/auth/AuthScreens.tsx](bento-web/src/auth/AuthScreens.tsx)
  - Styles: [bento-web/src/App.css](bento-web/src/App.css)
  - Behavior: default remains Individual; selection saved in local state and does not change current auth logic.

Recommended UX improvements (prioritized)
1. Onboarding & signup
   - After phone verification for Organization, present a short org creation form: org name, billing contact, optional invoice/PO fields.
   - Use progressive steps: Create org → Invite members → Add billing.
2. Package & Pricing clarity
   - Show a Pricing panel that lists Individual vs Org plans side-by-side with features (seats, delivery limits, discounts).
   - Add a small tooltip explaining "seat" and how billing works.
3. Checkout flow
   - Show clear billing entity (You vs Organization) and customer summary before payment.
   - Support seat quantity input for org plans.
4. Organization dashboard
   - New tab for Org Admins: Members, Seats, Billing, Invoices, Invite management.
   - Role model: Owner (billing), Admin (manage users), Member (order for self).
5. Invites & membership
   - Secure invite links with expiry and single-use tokens.
   - Allow existing users to join an org from their account settings.
6. Mobile UX tweaks
   - Increase tappable targets to 44px, consistent top spacing, sticky CTA for checkout.
7. Accessibility
   - Ensure form labels, aria attributes, focus states, and high-contrast colors for CTAs.

Technical notes to avoid impact on existing app
- Data model: add `organizations` table and `org_id` FK in `subscriptions` and `memberships`. Keep `user_id` ownership unchanged for individual subscriptions.
- API: add new endpoints for org creation, invites, and org billing. Do not change existing endpoints used by `moja-member-app`.
- Feature flag: use `org-billing` flag to gate UI & API usage in `bento-web`.
- Billing provider: create one customer per org; map webhooks by `customer.id` and `metadata.org_id` when present.

Testing checklist
- Unit tests for new components and invite flow.
- E2E tests: phone login (individual), phone login (org), invite accept, seat purchase, proration on seat change.
- Regression tests for all existing bento ordering flows.

Next steps (pick one)
- I can generate DB migration SQL and API route stubs for org support.
- Or I can design the Org onboarding screens (mock JSX + CSS) so you can review visuals.

Which next step do you want me to take?
