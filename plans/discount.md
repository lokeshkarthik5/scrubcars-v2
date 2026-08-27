# Discounts — Detlio implementation plan

Status: **decisions resolved, ready to build on your go-ahead.**

Goal: Shopify-style promo codes for Detlio. An admin creates a code in the
admin portal; a customer types it on the booking screen and pays less. One
end-to-end POC — real tables, real admin CRUD, real checkout UI — not a stub.

`plans/discount-base.md` (Medici Biologicals) is the *pattern* source, not the
spec. Detlio's money is rupee `numeric(10,2)` strings (not integer cents), its
checkout is a one-service booking (not a multi-line cart), it has no tax step,
no shipping, no subscriptions, and no sandbox gating. What carries over is the
shape: one resolution engine, server is authoritative, append-only redemption
audit, limits count only paid usage, never hard-delete a used rule.

**Decisions made** (were §10, now folded into the plan):

1. **Funding is per-discount.** Each code carries `funded_by` = `platform`
   (default — the admin absorbs it, the garage is paid the full pre-discount
   price) or `vendor` (the garage absorbs it). §2, §6.
2. **Vendor scoping stays.** A code can be global or tied to one garage.
3. **No ₹0 bookings.** Razorpay cannot take a ₹0 order, so the discount is
   floored to leave **₹1 payable**: percentages cap at 99%, and an oversized
   flat code clamps instead of erroring. Free bookings would need a
   skip-payment path — a separate feature. §3.
4. **Admin-only creation.** Vendors cannot create codes; vendor self-serve is a
   later pass.

---

## 1. Scope

**In**
- Admin-created **codes only** (every discount requires typing a code).
- Effect: **percentage off** (with optional cap) or **flat amount off**,
  always leaving at least ₹1 payable.
- Conditions: active toggle, start/end window, minimum booking amount,
  per-user limit, total usage limit, optional single-vendor scope.
- **Funding**: platform-funded or vendor-funded, chosen per code.
- Customer: apply/remove a code on `/book/[vendorId]`, see the breakdown, pay
  the discounted amount via the existing Razorpay flow.
- Admin: list / create / edit / activate-deactivate / delete discounts, with a
  redemption count per code.
- Audit: one `discount_redemptions` row per booking that used a code.

**Deliberately out** (Medici has these; Detlio does not need them for the POC)
- Automatic (code-less) discounts driven by who the customer is.
- Stacking and priority ordering — **one code per booking, full stop**.
- Sandbox-gated codes, membership/subscription conditions, free shipping.
- Basis points — percentages are stored as plain `numeric(5,2)` (`20.00` = 20%).
- Per-category / per-service scoping (vendor scope only).
- Vendor-created codes.
- Free (₹0) bookings.

---

## 2. Data model

New migration `server/drizzle/0016_add_discounts.sql` + journal entry
(idx 16, tag `0016_add_discounts`), applied with `bun run migrate` from
`server/`. Schema mirrored in `server/src/db/schema.ts`.

### `discounts`

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid pk | |
| `code` | varchar(40) not null | What the customer types. Compared case-insensitively |
| `description` | text | Admin-facing note ("Diwali launch offer") |
| `discount_type` | enum `discount_type` (`percentage`\|`fixed`) | |
| `percent_off` | numeric(5,2) | Set when `percentage`. `20.00` = 20%. Capped at 99 |
| `amount_off` | numeric(10,2) | Set when `fixed`. Flat ₹ off |
| `max_discount_amount` | numeric(10,2) | Ceiling on a percentage effect. null = uncapped |
| `min_order_amount` | numeric(10,2) | Booking subtotal must be ≥ this. null = no minimum |
| `per_user_limit` | integer | null = unlimited, `1` = once per customer |
| `total_usage_limit` | integer | null = unlimited across all customers |
| `vendor_id` | uuid → `vendors.id` ON DELETE CASCADE | null = valid at every garage |
| `funded_by` | enum `discount_funded_by` (`platform`\|`vendor`) not null default `platform` | Who absorbs the discount |
| `starts_at` | timestamptz | null = live immediately |
| `ends_at` | timestamptz | null = open-ended |
| `is_active` | boolean not null default true | Off switch that preserves history |
| `created_at` | timestamptz not null default now() | |

Indexes:
- `CREATE UNIQUE INDEX discounts_code_key ON discounts (lower(code))` — one code
  namespace, case-insensitive. This is the constraint the admin API turns into a
  409 `DISCOUNT_CODE_TAKEN`.
- `discounts_is_active_idx` on `(is_active)`.
- `discounts_vendor_id_idx` on `(vendor_id)`.

Check constraints (cheap, and they stop a malformed row reaching the engine):
- `percentage` ⟹ `percent_off > 0 AND percent_off <= 99`
- `fixed` ⟹ `amount_off > 0`
- `ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at`

### `discount_redemptions` — append-only audit

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `discount_id` | uuid → `discounts.id` **ON DELETE RESTRICT** | The audit trail outranks convenience |
| `booking_id` | uuid → `bookings.id` ON DELETE CASCADE, **unique** | One code per booking |
| `user_id` | uuid → `users.id` ON DELETE CASCADE | |
| `code` | varchar(40) not null | Snapshot of the code at redemption |
| `discount_amount` | numeric(10,2) not null | What it actually saved |
| `created_at` | timestamptz not null default now() | |

Indexes: `(discount_id)`, `(user_id, discount_id)` — the two counting queries.

### `bookings` — five new columns

| Column | Meaning |
|---|---|
| `subtotal_amount` numeric(10,2) | Pre-discount service price. Backfilled `= amount` for existing rows, then set NOT NULL |
| `discount_amount` numeric(10,2) not null default `0.00` | ₹ taken off |
| `discount_id` uuid → `discounts.id` ON DELETE SET NULL | |
| `discount_code` varchar(40) | Denormalised snapshot, so the receipt and admin booking list need no join |
| `discount_funded_by` varchar(20) | Snapshot of the code's funding at booking time. null when no discount |

`discount_funded_by` is **snapshotted, not joined**, on purpose: an admin
editing a live code's funding must not retroactively rewrite what garages were
already owed for past jobs.

**`bookings.amount` keeps its current meaning: the amount actually charged.**
That is deliberate — `payments.amount`, `toPaise()`, the Razorpay order and the
"Pay Now (₹X)" button on booking detail all read it today and stay correct with
zero changes. The invariant becomes:

```
amount = subtotal_amount − discount_amount
```

---

## 3. The engine

New file `server/src/lib/discounts.ts` — pure-ish resolution, mirroring how
`lib/pricing.ts` is shared by the booking, vendor and admin service layers.

```ts
resolveDiscount({ code, userId, vendorId, subtotal })
  → { discount, discountAmount, finalAmount }        // valid
  → throws AppError(400, <friendly reason>, <code>)  // invalid
```

Steps, in order (first failure wins):

1. **Look up** `WHERE lower(code) = lower($1)` → `DISCOUNT_NOT_FOUND`
   ("This code isn't valid.")
2. **Active** → `DISCOUNT_INACTIVE`
3. **Window** — `now()` within `starts_at`/`ends_at` → `DISCOUNT_NOT_STARTED` /
   `DISCOUNT_EXPIRED`
4. **Vendor scope** — `vendor_id` null or equal to the booking's vendor →
   `DISCOUNT_NOT_FOR_VENDOR` ("This code isn't valid at this garage.")
5. **Minimum** — `subtotal >= min_order_amount` → `DISCOUNT_MIN_ORDER`
   ("Add ₹X more to use this code." — message carries the minimum.)
6. **Total usage limit** — consumed count < limit → `DISCOUNT_EXHAUSTED`
7. **Per-user limit** — this user's consumed count < limit →
   `DISCOUNT_ALREADY_USED`
8. **Compute** (below).

**Consumed-count definition** — one shared SQL helper, used by both limit checks
and by the admin list's `redemptionCount`:

```sql
discount_redemptions r
  JOIN bookings b ON b.id = r.booking_id
  JOIN payments  p ON p.booking_id = b.id
WHERE r.discount_id = $1
  AND b.status <> 'cancelled'
  AND p.status = 'paid'
```

A booking that was created but never paid, or that was cancelled, does **not**
burn an allowance.

**Divergence from the base plan, on purpose:** Medici returns one vague message
for every failure because a leak would reveal sandbox-gated internal codes.
Detlio has none, and a marketplace shopper genuinely needs to know "expired" vs
"₹200 minimum" vs "not valid at this garage" — so the reasons are specific and
friendly, like Shopify's. If a private/internal code type is ever added, that
decision must be revisited.

### Computation

Work in integer paise inside the engine, return `numeric` strings — same
discipline as `lib/pricing.ts`'s `money()` helper, and it avoids float drift
without changing the column types.

```
MIN_PAYABLE_PAISE = 100                          // ₹1 — Razorpay's floor

subtotalPaise = round(subtotal * 100)

percentage: raw = floor(subtotalPaise * percent_off / 100)
            if max_discount_amount: raw = min(raw, round(max * 100))
fixed:      raw = round(amount_off * 100)

maxAllowed    = max(0, subtotalPaise − MIN_PAYABLE_PAISE)
discountPaise = clamp(raw, 0, maxAllowed)
finalPaise    = subtotalPaise − discountPaise    // always ≥ ₹1
```

The clamp is what keeps Razorpay happy: `toPaise()` in `lib/razorpay.ts` throws
`INVALID_AMOUNT` on anything `<= 0`, so the engine simply never produces a ₹0
total. A `fixed` code worth more than the service is **clamped, not refused** —
₹500-off on a ₹300 wash charges ₹1 rather than erroring at checkout. Admins who
want a near-free promo get 99%; genuinely free bookings need a skip-payment
path and are out of scope.

---

## 4. Customer flow

### Preview — `POST /api/v1/discounts/validate`

New module `server/src/modules/discounts/` (routes/controller/service/
repository/validation, matching every other module). Mounted in `app.ts`:

```ts
app.route('/api/v1/discounts', discountsRoutes)
```

Auth: `authMiddleware, requireCustomer`, plus `rateLimiter` (10/min) — a code
endpoint is the one place brute-forcing is worth the guard.

Request `{ code, vendorId, serviceId, vehicleId }` → the service recomputes the
subtotal from the service + vehicle tier via the **existing**
`computeServiceAmount()` (never trusts a client-sent amount), then calls
`resolveDiscount`.

Response `{ code, description, discountType, discountAmount, subtotal,
finalAmount }`, or a 400 with the friendly reason from §3.

### Binding — `POST /api/v1/bookings`

- `createBookingSchema` gains `discountCode: z.string().trim().min(1).max(40).optional()`.
- `bookingsService.createBooking` — after `computeServiceAmount()` returns
  `amount` and **before** the slot check, resolve the code (when present) to get
  `{ discountId, discountAmount, finalAmount, fundedBy }`. On failure the
  AppError from the engine propagates as-is.
- `bookingsRepository.createBookingWithPayment` takes the extra fields and, in
  the **same transaction** that already inserts booking + payment:
  - `bookings` gets `subtotalAmount`, `discountAmount`, `discountId`,
    `discountCode`, `discountFundedBy`; `amount` = `finalAmount`.
  - `payments` is unchanged — `gateway: 'razorpay'`, `status: 'pending'`,
    `amount: finalAmount`. The ₹1 floor means there is always something to
    charge.
  - one `discount_redemptions` row, when a code applied.
  - re-check the two usage limits **inside** the transaction, after taking
    `pg_advisory_xact_lock(hashtext('discount:' || discount_id))` — the same
    lock idiom `rescheduleBookingWithPayment` already uses for the reschedule
    cap. Cheap, and it closes the obvious double-redeem race.
- **Nothing in `payments.service.ts` or `lib/razorpay.ts` changes.** The order
  is built from `booking.amount`, which is already the discounted figure, and
  the engine's floor guarantees it is ≥ ₹1.

### Reschedule

`rescheduleBookingWithPayment` creates a *new* booking row and retires the old
one. It must:
- copy `subtotal_amount`, `discount_amount`, `discount_id`, `discount_code`,
  `discount_funded_by`, `amount` to the new row (a reschedule is not a
  re-price) — the source payment is already copied as-is; and
- **move** the existing redemption to the new booking (`UPDATE
  discount_redemptions SET booking_id = <new> WHERE booking_id = <old>`) rather
  than inserting a second one.

Without this the customer either loses their discount on reschedule or burns a
second use of it.

### Cancellation / refund

No new code. A cancelled booking drops out of the consumed count by definition
(§3), which returns the allowance to the customer automatically.

### Vendor payout

The booking response gains a server-computed `vendorPayoutAmount`:

```
funded_by = 'platform'  → subtotal_amount   (garage paid in full, admin eats it)
funded_by = 'vendor'    → amount            (garage eats it)
no discount             → amount
```

Computing it server-side keeps the branch in one place.
`web/lib/vendor-stats.ts` (`computeEarningsSummary`, `computeRecentEarningsJobs`)
switches from `booking.servicePrice` to this field, so the vendor's Earnings
screen tells the truth under either funding model.

### Web UI — `web/app/book/[vendorId]/page.tsx`

State mirrors the base plan's split, which exists to stop every keystroke
re-querying:

- `promoInput` (the text field) vs `appliedPromo` (set only on Apply).
- Apply → `useValidateDiscount()` mutation → on success store the result, on
  failure show the server's message under the input. Remove → clear both.
- The cart summary card becomes a breakdown when a discount is applied:
  `Service ₹1,200 · Discount (SAVE20) −₹240 · Total ₹960`, discount line in
  green.
- The sticky CTA reads `Pay Now (₹960)`.
- `handleConfirm` passes `discountCode: appliedDiscount?.code` to
  `createBooking`; the Razorpay path that follows is untouched.
- If the server rejects the code at booking time (expired between apply and pay,
  limit hit by someone else), surface the error and clear the applied state so
  the customer can retry at full price.
- Clear `appliedDiscount` whenever service or vehicle changes — the subtotal
  moved, so the minimum-order check and the computed amount are stale.

New: `web/lib/api/discounts.ts` (`validateDiscount`), `CreateBookingPayload`
gains `discountCode?`, and `bookingRequestKey()` in `bookings-store.ts` gains
the code (otherwise the dedupe map treats a coded and uncoded attempt as the
same request).

### Receipt — `web/app/bookings/[id]/page.tsx`

`mappers.ts` maps the new fields onto `Booking` (`subtotalPrice`,
`discountAmount`, `discountCode`, `vendorPayoutAmount`) and the detail page
renders the three-line breakdown when `discountAmount > 0`. The existing
"Pay Now" path needs no change — it already reads the discounted `amount`.

---

## 5. Admin flow

### API — `/api/v1/admin/discounts`

**The admin session cookie is scoped to `path=/api/v1/admin`**
(`admin.controller.ts:24`). Admin discount routes therefore **must** live under
that prefix or the browser will not send the cookie and every call 401s. Mount
inside `admin.routes.ts`:

```ts
adminRoutes.route('/discounts', adminDiscountRoutes)   // → /api/v1/admin/discounts
```

using `[authMiddleware, requireAdmin]` exactly like the vendor routes.

| Route | Behaviour |
|---|---|
| `GET /` | List, newest first. `?q=` matches code+description, `?active=`. Each row carries `redemptionCount` and `totalSaved`, batched with **one** GROUP BY — never N+1 |
| `POST /` | Create. 409 `DISCOUNT_CODE_TAKEN` on the unique index |
| `GET /:id` | Single discount + counts |
| `PATCH /:id` | Partial update; also the activate/deactivate path |
| `DELETE /:id` | 409 `DISCOUNT_IN_USE` once any redemption exists; hard-deletes only an unused code |
| `GET /vendors` | Garage options for the vendor-scope picker. Registered before `/:id` so "vendors" is never read as an id |

Validation lives in `discounts.validation.ts`, refined so that:
- `percentage` requires `percentOff` (0 < p ≤ 99) and forbids `amountOff`;
- `fixed` requires `amountOff > 0` and forbids `percentOff`/`maxDiscountAmount`;
- `endsAt > startsAt` when both present;
- limits are positive ints or null;
- `vendorId` must reference an existing vendor when set.

Follow `admin.validation.ts`'s existing `superRefine` style
(`refineServicePricing` is the model).

### Admin UI — `web/app/admin/discounts/`

- Nav item added to `NAV` in `web/app/admin/layout.tsx`, and the two clean
  paths added to `ADMIN_CLEAN_TO_INTERNAL` in `web/middleware.ts`
  (`/discounts` → `/admin/discounts`, plus a `/discounts/:id/edit` regex
  alongside the existing `/vendors/:id/edit` one) so `admin.detlio.com/discounts`
  resolves.
- `page.tsx` — list of `ScCard` rows in the exact shape of
  `app/admin/vendors/page.tsx`: `TopBar` with an "Add discount" button,
  `SkeletonCard` / `ErrorState` / `EmptyState`, per-row `ScBadge` for
  Active / Scheduled / Expired / Inactive, a `Meta` grid for effect, conditions,
  funding and usage, and row actions Edit / Activate-Deactivate / Delete.
  **Delete only renders when `redemptionCount === 0`**, mirroring the API's 409.
- `new/page.tsx` and `[id]/edit/page.tsx` — one shared form component
  (`components/features/discount-form.tsx`) using `ScInput` / `ScSelect` /
  `ScCheckbox`, following `app/admin/vendors/new/page.tsx`'s plain
  `useState` + submit style. No new form library.
- **Funding field**: a two-option `ScSelect` — "Platform absorbs (garage paid in
  full)" / "Garage absorbs". Defaults to platform. The list row shows it as a
  badge, because it is the field with real money behind it.
- **Deep-discount guard rail**: a code at 90%+ off, or a flat code with no
  minimum order, shows an inline nudge to set a `per_user_limit` and a
  `total_usage_limit`. A nudge, not a block — but it must never be the silent
  default.
- Human labels composed in one place: `effectLabel` ("20% off, max ₹500"),
  `conditionLabel` ("min ₹999 · once per customer ·
  Sparkle Motors only").
- Admin unit: the form takes `20` for 20% and `₹500` as rupees — which is what
  the API stores, so no unit conversion layer is needed (a simplification over
  Medici's bps ↔ percent form mapping).

### Reporting

`admin.repository.ts`'s `listBookings` already loads `payment`; add
`discountCode`, `discountAmount` and `discountFundedBy` to the admin booking
list response and show them in `app/admin/bookings/page.tsx`. Platform-funded
discounts are the admin's own marketing spend, so having them visible per
booking is the whole reporting story for the POC.

---

## 6. Invariants — do not break

1. **The server is authoritative.** `/discounts/validate` is a preview.
   `POST /bookings` re-resolves from scratch and is the only figure that binds.
   Never accept a `discountAmount` or a subtotal from the client.
2. **The subtotal is always recomputed** from `computeServiceAmount(service,
   vehicleType)` — the one function that already refuses to bill an SUV at the
   hatchback rate.
3. **`amount = subtotal_amount − discount_amount`**, and `amount` remains what
   is actually charged. Every existing reader depends on that.
4. **`discount_funded_by` is snapshotted on the booking**, never read live off
   the discount row. Editing a code must not rewrite historical payouts.
5. **One code per booking** — enforced by the unique `booking_id` on
   `discount_redemptions`, not just by convention.
6. **The redemption row is written in the same transaction as the booking**,
   under the discount advisory lock.
7. **Limits count paid, non-cancelled redemptions only.**
8. **A resolved total is never below ₹1.** The engine clamps; nothing
   downstream has to defend against a ₹0 Razorpay order.
9. **Never hard-delete a redeemed discount** — 409, deactivate instead.
10. **Money is `numeric(10,2)` strings at rest, integer paise in the engine.**
    No floats crossing a boundary.
11. **Admin discount routes stay under `/api/v1/admin/*`** — cookie path.

---

## 7. Build order

Each step is independently verifiable; stop and check before moving on.

1. **Migration + schema** — `0016_add_discounts.sql`, journal entry, Drizzle
   tables/enums/relations, booking columns backfilled. Verify with
   `bun run migrate:status`.
2. **Engine** — `lib/discounts.ts` and the repository counting queries.
   Exercise via a scratch script: percentage, fixed, cap, 99%, over-value
   fixed, minimum, expired, wrong vendor, per-user limit, total limit.
3. **Admin API** — `modules/discounts/` admin routes; verify with `curl`
   against a logged-in admin cookie (create → list → patch → delete-409).
4. **Admin UI** — list + create/edit + funding field + nav + middleware paths.
   Create real codes from the browser.
5. **Customer validate endpoint** + `web/lib/api/discounts.ts`.
6. **Booking write path** — schema field, service resolution, transactional
   redemption, reschedule carry-over.
7. **Booking UI** — promo input, breakdown, CTA, receipt lines.
8. **Payout wiring** — `vendorPayoutAmount` on the booking response,
   `vendor-stats.ts` switched over.
9. **End-to-end POC run** — the checklist in §8.

Steps 1–4 and 5–9 are two natural review points.

## 8. POC acceptance checklist

Run against local `web` + `server` with a seeded vendor and a real Razorpay
test order:

- [ ] Admin creates `TEST20` — 20% off, max ₹300, min ₹500, per-user 1,
      total 5, platform-funded, active, no vendor scope.
- [ ] Customer on `/book/:vendorId` applies `test20` (lowercase) → accepted.
- [ ] Breakdown shows subtotal, −discount, total; CTA shows the discounted ₹.
- [ ] Booking is created with `subtotal_amount` / `discount_amount` /
      `discount_code` / `discount_funded_by` set and `amount` = subtotal −
      discount.
- [ ] Razorpay order amount equals the discounted total (check the dashboard).
- [ ] After payment: `discount_redemptions` has exactly one row; admin list
      shows `Used 1`.
- [ ] The same customer re-applying `TEST20` is refused with
      "You've already used this code."
- [ ] Cancelling that booking makes the code usable by that customer again.
- [ ] Rescheduling a discounted booking keeps the discount and does **not**
      create a second redemption.
- [ ] A code below its minimum, past `ends_at`, or scoped to another vendor is
      each refused with its own message.
- [ ] A flat code worth more than the service clamps to a ₹1 total rather than
      erroring, and Razorpay accepts the order.
- [ ] A 99% code on the cheapest service still produces a payable order.
- [ ] **Payout**: platform-funded booking shows the *pre-discount* amount in the
      vendor's Earnings; a vendor-funded one shows the discounted amount.
- [ ] `DELETE` on a used code returns 409; deactivating it works and it then
      fails validation for customers.
- [ ] Booking detail and admin booking list both show the discount.

## 9. Known limitations (accepted for the POC)

- **No stacking, one code per booking.** The unique constraint makes adding
  stacking later a migration, which is the right cost for a feature nobody has
  asked for.
- **No automatic discounts.** Everything requires typing a code.
- **Limits are eventually correct, not instantaneous.** Two unpaid bookings can
  both hold the last use of a code; whichever pays second still keeps its
  discounted price. The advisory lock only stops the same-instant double write.
  Accepted — same trade-off as the base plan.
- **No per-service or per-category scoping** — vendor scope only.
- **No free (₹0) bookings.** The engine floors every total at ₹1 because
  Razorpay cannot take a ₹0 order. A genuine free-booking feature needs a
  skip-payment path (mark paid, confirm, no gateway) and is its own pass.
- **Vendors cannot create or see their own codes** — admin-only, by decision.
  A vendor-funded code is created by an admin on the garage's behalf; there is
  no vendor approval step yet.
- **No refund path for a discounted booking.** Cancellation frees the
  allowance, but money already captured by Razorpay is refunded out-of-band, as
  it is today.
- **No automated tests.** The server has no test harness today; §8 is the
  manual gate. If one is added later, the engine's condition matrix is the
  highest-value target.

---

## 10. Data fetching — TanStack Query

The discount module is the codebase's first user of `@tanstack/react-query`,
and the pattern to copy when the rest of the app migrates.

- **One client, created in state** (`query-provider.tsx`), mounted above
  `AppProvider` in the root layout so the cache survives the auth gate's
  `null` render. A module-scope client would be shared across requests on the
  server and leak one user's data into another's.
- **Defaults**: `staleTime: 30s`, and **no retry on 4xx** — an expired code or
  a 403 is an answer, not a blip, and retrying only delays the message.
- **`discountKeys`** is a hierarchical key factory, so one
  `invalidateQueries({ queryKey: discountKeys.lists() })` after any write
  refreshes every list, filtered or not.
- **Queries** for reads (`useAdminDiscounts`, `useAdminDiscount`,
  `useDiscountVendorOptions`). **Mutations** for writes — and also for
  `useValidateDiscount`, which is a POST the customer triggers and whose answer
  must never come from cache, since eligibility moves with usage counts.
- **Navigation lives in the page**, not the hook: `mutate(input, { onSuccess:
  () => router.push(...) })`. The hook owns the write and the invalidation.
- `useToggleDiscountActive` is **optimistic**, with a snapshot rollback in
  `onError` — the switch should feel instant.
- The remaining screens (bookings, vendors, services, earnings) still use the
  Zustand stores plus hand-rolled `useEffect` fetching. They can move one at a
  time; nothing forces a big-bang migration.

---

## 11. File map (what this touches)

| Concern | File | New? |
|---|---|---|
| Migration | `server/drizzle/0016_add_discounts.sql` + `meta/_journal.json` | new |
| Schema | `server/src/db/schema.ts` | edit |
| Engine (math + row checks) | `server/src/lib/discounts.ts` | new |
| Customer + admin API | `server/src/modules/discounts/*` | new |
| Route mounts | `server/src/app.ts`, `server/src/modules/admin/admin.routes.ts` | edit |
| Booking write path | `server/src/modules/bookings/{validation,service,repository}.ts` | edit |
| Admin booking report | `server/src/modules/admin/admin.{service,repository}.ts` | edit |
| Customer API client | `web/lib/api/discounts.ts` | new |
| Query hooks (keys, queries, mutations) | `web/lib/api/hooks/use-discounts.ts` | new |
| Query client | `web/components/providers/query-provider.tsx` · `web/app/layout.tsx` | new · edit |
| Booking payload + store | `web/lib/api/bookings.ts`, `web/lib/stores/bookings-store.ts` | edit |
| Types + mappers | `web/lib/types/index.ts`, `web/lib/api/mappers.ts` | edit |
| Payout math | `web/lib/vendor-stats.ts` | edit |
| Checkout UI | `web/app/book/[vendorId]/page.tsx` | edit |
| Receipt UI | `web/app/bookings/[id]/page.tsx` | edit |
| Admin API client | `web/lib/api/admin.ts` | edit |
| Admin UI | `web/app/admin/discounts/{page,new/page,[id]/edit/page}.tsx` | new |
| Admin form | `web/components/features/discount-form.tsx` | new |
| Admin nav + routing | `web/app/admin/layout.tsx`, `web/middleware.ts` | edit |
