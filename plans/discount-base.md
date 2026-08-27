---
name: discount
description: 'Discounts end-to-end in Medici Biologicals — the rule engine (services/discounts.ts), promo codes, stacking, usage limits, sandbox-gated codes, and how a discount flows through quote → tax → Netvalve → order → receipt, plus the admin Discounts page (create/edit/toggle/delete rules) and the customer promo-code UI on order checkout and membership signup. Use when: (1) Changing discount rules, promo codes, or the resolution engine, (2) Touching checkout/subscription/tax pricing math, (3) Working on the admin Discounts page or discount reporting, (4) Debugging "why did/didn''t this discount apply", (5) Adding a new discount effect or condition. Triggers on: "discount", "promo code", "coupon", "percent off", "free shipping", "stackable", "redemption", "usage limit", "discount rule", "sandbox code", "checkout pricing", "quote".'
---

# Discounts

> Source of truth is the code, not `docs/plans/14-discounts.md` — that plan
> predates promo codes, `sandbox_only`, subscription-order discounts, and the
> `appliedCode` feedback loop. Read this file, then the four files in §10.

Two ways a discount reaches a member:

- **Automatic** (`code IS NULL`) — applies from who they are (membership tier)
  and how many times they've already used the rule. No typing.
- **Promo code** (`code IS NOT NULL`) — only enters the candidate set when the
  shopper types that exact code (case-insensitive).

Both run through **one engine** — `resolveOrderDiscount()` — used by four call
sites: order quote, order session, tax calculate, and membership
preview/checkout.

---

## 1. Data model

### `discount_rules`
| Column | Meaning |
|---|---|
| `name`, `description` | Admin-facing copy |
| `active` | Off switch that preserves history (prefer over delete) |
| `priority` | **Lower runs first.** Highest-priority match decides the stacking mode |
| `code` | `NULL` = automatic. Non-null = must be typed. Case-insensitively unique via a **partial** unique index (`WHERE code IS NOT NULL`), so many NULL-code rules coexist |
| `sandbox_only` | Security gate — rule only matches a redeemer whose phone is on the `sandbox_phone_numbers` config list |
| `applies_to_order_type` | `treatment_plan` \| `subscription` \| `any`. Free-text column, enum enforced in Zod |
| `requires_active_membership`, `required_plan_key` | Conditions (`monthly` \| `annual` \| null = any membership) |
| `per_user_limit`, `total_usage_limit` | Shopify-style limits. `NULL` = unlimited, `1` = once per customer |
| `percent_off_bps` | Effect. **Basis points**: 2000 = 20% |
| `free_shipping` | Effect. Waives the flat per-state charge |
| `max_discount_cents` | Ceiling on the % effect. `NULL` = uncapped |
| `stackable` | Combines with other stackable matches on one order |
| `starts_at`, `ends_at` | Active window, `NULL` = open-ended |
| `created_by` | Admin's Supabase auth id. **No FK** — admins live in Supabase auth, not `users_meta` |

Index: `idx_discount_rules_active_priority` on `(priority, id) WHERE active`.

### `discount_redemptions` — append-only audit
`discount_rule_id`, `user_id`, `order_id`, `discount_cents`, `free_shipping`.
Unique on `(rule, order)`. Rule FK is `ON DELETE RESTRICT` (the audit trail
outranks convenience); order FK is `ON DELETE CASCADE`.
**One row per applied rule** — a stacked order writes several.

### `orders` columns
`discount_cents`, `discount_rule_id` (FK `SET NULL`, the *highest-priority*
applied rule), `free_shipping`.
`subtotal_cents` stays **pre-discount** so a receipt renders list → discount →
total: `total = subtotal − discount + shipping + tax`.

Migrations: `0032_discounts.sql` (tables + order columns + seeds two clubbed
annual-member rules), `0037_discount_codes.sql` (`code` + `sandbox_only`).

---

## 2. The engine — `apps/api/src/services/discounts.ts`

```ts
resolveOrderDiscount({ userId, orderType, subtotalCents, shippingCents, code? })
  → { discountRuleId, percentOffBps, discountCents, freeShipping,
      effectiveShippingCents, appliedCode, redemptions[] }
```

**Step 1 — candidate SQL.** Active, inside the date window, order type matches
(or is `'any'`), ordered by `priority ASC, id ASC`. The code clause is the
subtle one:

```ts
code
  ? or(isNull(discountRules.code), sql`lower(code) = lower(${code})`)
  : isNull(discountRules.code)
```

With no code typed, **only automatic rules survive**. A code-bearing rule can
never auto-apply.

**Step 2 — conditions** (`ruleMatches`), in this order:
1. `sandboxOnly` → caller must be on the sandbox allow-list (else drop).
2. Membership → `loadEntitledSubscription(userId)`; plan key must match when
   `requiredPlanKey` is set.
3. `perUserLimit` → this member's **paid** redemptions of the rule.
4. `totalUsageLimit` → **paid** redemptions across all members.

The membership lookup and the sandbox check are each **memoized** across the
whole rule loop — at most one query apiece regardless of rule count.

**Step 3 — stacking.** The highest-priority match sets the mode:

```ts
const primary = matches[0]!;
const applied = primary.stackable ? matches.filter(r => r.stackable) : [primary];
```

A non-stackable primary applies **alone**, even if stackable rules also matched.

**Step 4 — combine** (`combineEffects`):
- Per rule: `floor(subtotal * bps / 10000)`, then clamp to `maxDiscountCents`.
- Sum, then clamp the total to the subtotal (total never dips below
  shipping + tax).
- `percentOffBps` is **recomputed from the combined figure**
  (`round(discount/subtotal * 10000)`) — that effective rate is what TaxCloud
  gets, not any single rule's rate.
- `freeShipping` is OR-ed; `effectiveShippingCents` becomes 0 when waived.
- `appliedCode` = the code of whichever applied rule carries one — this is how
  the FE distinguishes "accepted" from "typed but ineligible".

**Usage counting** — `countPaidRedemptions` joins `discount_redemptions` →
`orders` and requires `orders.paid_at IS NOT NULL`. An abandoned checkout never
burns an allowance.

---

## 3. Customer flow — one-time (treatment-plan) order

```
POST /v1/checkout/quote   ← preview:  discount + free shipping ARE computed, tax is NOT
POST /v1/tax/calculate    ← tax on the discounted base (mirrors the session path)
POST /v1/checkout/session ← AUTHORITATIVE: re-resolves, persists, charges
```

**Quote** (`routes/checkout/index.ts`) takes `{ peptideId, code? }` and returns
`discountCents`, `freeShipping`, `appliedCode`. It is a preview — never trusted.

**Session** is the binding path, and the order inside it matters:

1. Compute the raw subtotal from the selected lines.
2. **Resolve the discount BEFORE tax** — TaxCloud must see the discounted base.
3. Build TaxCloud line items:
   - Peptide lines carry **pre-discount** prices, each with its TIC code.
   - The discount rides as a **cart-level** `discounts.lineItemDiscounts[]`
     (`{ itemId, type: "percentage", value: bps/10000 }`) via
     `buildPeptideLineDiscounts`. The v3 API has **no per-line `discount`
     field** — discounts live on the cart.
   - The shipping line is **omitted entirely** when shipping is waived (no tax
     on a $0 charge). Shipping is never in `lineItemDiscounts`.
4. `computeTotals({ items, discountCents, shippingCents: effectiveShippingCents, taxCents })`
   → `total = subtotal − discount + shipping + tax`, guarded by
   `INVALID_DISCOUNT` (422) if the discount is negative or exceeds subtotal.
5. **In one transaction**: insert `orders` (with `discountCents`,
   `discountRuleId`, `freeShipping`), the immutable `order_items` snapshots, the
   `netvalve_events` audit row, and **one `discount_redemptions` row per applied
   rule**; then claim the `user_peptides`.
6. Netvalve is charged `total_cents / 100`. Resume/settle/`finalizePaid` are
   untouched — the discounted total is **frozen on the order at create time**.

**Web UI** (`app/app/plan/[peptideId]/checkout/page.tsx`):
- `promoInput` (the text field) vs `activeCode` (committed on Apply) are
  separate state — typing doesn't re-quote, applying does.
- `useCheckoutQuote(peptideId, { code })` uses `placeholderData: keepPreviousData`
  so applying a code spins only the Apply button, not the whole section.
- **The quote key must not pad an omitted code with `""`.** React Query's
  `partialMatchKey` compares every element present in the filter key, so
  `quote(peptideId)` with a `""` slot does *not* match a live coded quote and
  invalidation silently no-ops. That was the "saved shipping address never
  appears while a promo code is applied" bug. See `checkoutKeys.quote`.
- The page derives `discountRate = discountCents / subtotalCents` from the
  quote and re-applies it as items are toggled; the server recomputes the
  binding figure at session time.
- Feedback: `activeCode && appliedCode` → "Code X applied" + Remove;
  `activeCode && !appliedCode && !pending` → "That code isn't valid for your
  account." (Deliberately vague — never reveal *why* a sandbox-gated code
  failed.)
- `ShippingSummary` renders a green "Member discount −$X" line and a green
  "FREE" shipping label.
- `useCalculateTax(..., code)` passes the same code so previewed tax matches.

**Receipts**: `lib/orders.ts` adds a `discount` line to `OrderReceipt` when
non-zero; `services/order-confirmation-email.ts` renders "Member discount" in
both the text and HTML bodies; `app/app/orders/[id]/page.tsx` shows the break.

## 4. Customer flow — membership (subscription)

Same engine, `orderType: "subscription"`, `shippingCents: 0`.

- `POST /v1/subscription/preview` `{ planKey, code? }` → `{ amountCents,
  discountCents, effectiveAmountCents, appliedCode }`. Read-only, no tax.
- `POST /v1/subscription/checkout-session` re-resolves and applies
  `effectiveAmountCents = max(plan.amountCents − discountCents, 0)` to **both**
  the Netvalve charge and the **recurring amount** — so *every rebill stays
  discounted*. That is intended for internal test codes; think hard before
  attaching a public code to a membership.
- `subtotal_cents` on the resulting order stays the pre-discount plan price.
- Web: `app/start/payment/page.tsx` + `useSubscriptionPreview(planKey, code)`
  (idle until a code is set, keyed on plan+code). Fires the
  `onboarding_promo_applied` analytics event once per successfully applied code
  (`promoFiredRef` guards the duplicate).

## 5. Admin flow

**API** — `routes/admin/discounts.ts`, mounted at `/v1/admin/discounts`,
role-gated:

| Route | Notes |
|---|---|
| `GET /` | Keyset list (`createdAt, id` DESC), `?q=` searches name+description, `?active=`. Each row carries `redemptionCount`, batched via one `countsByRule` GROUP BY — never N+1 |
| `POST /` | Create; stamps `createdBy` from `c.get("doctorId")` |
| `GET /:id` | Single rule + count |
| `PATCH /:id` | Partial update — also the **toggle-active** path |
| `DELETE /:id` | **409 `DISCOUNT_RULE_IN_USE`** once any redemption exists. Hard-deletes only an unused rule |

`toRowValues()` copies only keys **present** in the body (so PATCH stays
partial) and converts `startsAt`/`endsAt` strings to `Date` or `null`.

**Admin UI** — `apps/admin/src/app/discounts/`:
- `page.tsx` — TanStack Table over `useDiscountRules` (infinite query +
  `useLoadAllPages`), nuqs-backed `q` / `status` / `sort` / `edit` params, so
  the edit dialog is deep-linkable (`?edit=<ruleId>`).
- The create/edit dialog is one RHF form on `discountRuleFormSchema`, which
  uses **friendlier units than the wire**: `percentOff` (0–100) → `percentOffBps`,
  `maxDiscountDollars` → `maxDiscountCents`, `perUserLimit`/`totalUsageLimit`
  as free text where blank/0/invalid → `null` (unlimited), `requiredPlanKey`
  `""` → `null` (any membership), `code` `""` → `null` (automatic rule). The
  page does that conversion on submit — the API only ever sees wire units.
- `columns.tsx` composes human labels: `effectLabel` ("20% off + free shipping ·
  stacks"), `conditionLabel` ("annual member, once per customer"). Row actions
  are Edit / Activate-Deactivate / Delete, and **Delete only renders when
  `redemptionCount === 0`** — mirroring the API's 409.
- The **Used** count links to `/orders?discountCode=<code>` for code-bearing
  rules with at least one redemption.

**Reporting** — `routes/admin/orders.ts` left-joins `discount_rules` to expose
`discountCode` on the order list (filterable, also in the CSV export).
`OPERATOR_HIDDEN_ORDER_COLUMNS` hides `discountCents` / `discountCode` from
operator-role users. The order drawer shows a `-$X` Discount row.

## 6. Types — `packages/types/src/discounts/`

`request.ts` (create/update/query + `discountOrderTypeSchema`,
`discountPlanKeySchema`) · `response.ts` (+ `redemptionCount`, derived
per-request, never stored) · `formatters.ts` (`formatDiscountRuleResponse`,
narrows the free-text DB columns to the wire enums) · `form.ts` (the admin form
shape).

Two gotchas encoded there:
- **Do not use `z.iso.datetime()` / `z.string().datetime()`** for the window
  fields. Both route through Zod 4's `ZodISODateTime` constructor, which
  Turbopack evaluates out of order during the web app's SSR prerender and
  crashes the production build ("Cannot access 's' before initialization"). Use
  a plain string + `Date.parse` refine.
- Form numbers are registered with `valueAsNumber`, **not** `z.coerce` — coerce
  makes the resolver's input type `unknown` and breaks RHF typing.

Create is refined: a rule must grant something (`percentOffBps > 0 ||
freeShipping`). Update is refined to require at least one field.

## 7. Known limitations (deliberate)

- **Concurrency**: limits count *paid* redemptions, so two orders created
  before either pays can both see the discount. Accepted.
- **No fixed-amount effect** — percentage + free shipping only.
- **`discount_rule_id` on `orders` records only the highest-priority applied
  rule.** For the full picture of a stacked order, read
  `discount_redemptions`.
- **No discount tests.** `apps/api/src/__tests__/` has none for
  `services/discounts.ts` — a stacking/limit/code matrix is the highest-value
  test to add.

## 8. Common tasks

**A percentage promo code, one per customer**
Create a rule with `code`, `percentOffBps`, `perUserLimit: 1`,
`appliesToOrderType: "treatment_plan"`. Leave `stackable: false` unless it
should club with the standing member rules.

**A high-value internal test code** — set `sandboxOnly: true` and add the
tester's phone to the `sandbox_phone_numbers` config list. A leak is then inert
for real customers.

**Stop a live promo** — PATCH `active: false`. Never DELETE (409 anyway once
redeemed) — deactivation keeps the audit trail and the order join intact.

**Change the standing member offer** — the two seeded annual rules are ordinary
rows; edit them in the admin UI. Don't write a migration.

**Add a new condition** — add the column (migration) → Drizzle schema → the
create/update/response Zod schemas + formatter → `ruleMatches()` (memoize any
new lookup) → the admin form + `conditionLabel`.

**Add a new effect** — the effect must land in `combineEffects` *and* in the
money flow: `computeTotals`, the TaxCloud mapping, the Netvalve amount, the
order columns, and the receipt/email. An effect that skips the tax mapping
silently overcharges tax.

## 9. Invariants — do not break

1. **Server is authoritative.** The quote is a preview; `/session` re-resolves
   and is the only figure that binds. Never accept a discount from the client.
2. **Resolve before tax.** Tax must be computed on the discounted base, or the
   member is overcharged and the TaxCloud filing is wrong.
3. **`subtotal_cents` stays pre-discount.** Receipts and reporting depend on it.
4. **Money is integer cents; percentages are basis points.** No floats.
5. **One `discount_redemptions` row per applied rule**, written in the same
   transaction as the order.
6. **Limits count paid redemptions only.**
7. **A code-bearing rule never auto-applies.**
8. **Never hard-delete a redeemed rule** — 409 and deactivate.
9. **Don't leak why a code failed.** One vague message covers invalid, expired,
   ineligible, and sandbox-gated alike.

## 10. File map

| Concern | File |
|---|---|
| Engine | `apps/api/src/services/discounts.ts` |
| Pricing math | `apps/api/src/services/checkout-pricing.ts` |
| TaxCloud mapping | `apps/api/src/services/tax-line-items.ts` (`buildPeptideLineDiscounts`) |
| Order checkout | `apps/api/src/routes/checkout/index.ts` |
| Tax preview | `apps/api/src/routes/tax/calculate-tax.ts` |
| Membership | `apps/api/src/routes/subscription/index.ts` |
| Admin API | `apps/api/src/routes/admin/discounts.ts` |
| Admin reporting | `apps/api/src/routes/admin/orders.ts` |
| Schema | `packages/db/src/schema.ts` · migrations `0032`, `0037` |
| Contracts | `packages/types/src/discounts/*` · `checkout/index.ts` |
| Admin UI | `apps/admin/src/app/discounts/{page,columns}.tsx` |
| Admin data | `apps/admin/src/lib/api/{admin.ts,hooks/use-admin.ts}` |
| Customer order UI | `apps/web/src/app/app/plan/[peptideId]/checkout/page.tsx` |
| Customer membership UI | `apps/web/src/app/start/payment/page.tsx` |
| Customer data | `apps/web/src/lib/api/hooks/{use-checkout,use-subscription,use-tax}.ts` |
| Receipts | `apps/api/src/lib/orders.ts` · `services/order-confirmation-email.ts` |
