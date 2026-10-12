<!-- BEGIN:nextjs-agent-rules -->

# Project: Detlio — agent instructions

## Stack

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Auth**: OTP (SMS) + Google OAuth, JWT access tokens + refresh tokens (HttpOnly cookies)
- **Payments**: Razorpay (online), cash on service
- **Storage**: GCS for vendor photos

---

## Rules

### Repository layout

This is a bun-workspaces monorepo driven by Turborepo. Four deployables:

```
apps/users      detlio.com          customer app
apps/vendors    vendor.detlio.com   vendor portal
apps/admin      admin.detlio.com    operations panel
apps/server     api.detlio.com      Hono API
packages/core   @repo/core          API client, types, stores, domain helpers
packages/ui     @repo/ui            shared components + globals.css
```

- Each frontend serves its routes at their real public paths. There is no
  middleware rewriting `/vendor/*` or `/admin/*` any more — a route's directory
  under `app/` is the URL it is served at. Do not reintroduce a path map.
- Surface-specific code lives in its app. `packages/*` is for code at least two
  apps use; `packages/core` must never import from `packages/ui`.
- The three frontends call `api.detlio.com` directly. Any new origin that needs
  to reach the API must be added to `corsOrigin` in `apps/server/src/lib/env.ts`.
- `apps/server/src/package.json` is a one-line ESM marker required by the Vercel
  build output. It is not a workspace — never add `apps/server/**` to the
  workspace globs, and do not delete or rename it.

### Database

- Do NOT run migrations when making schema changes
- Do NOT call `drizzle-kit push` or `drizzle-kit migrate`
- Only modify schema files — the developer runs migrations manually
- Production is migrated by `.github/workflows/release-api.yml` after E2E passes on `main`, before the API deploys. A new migration file must:
  - take the next number with no gap (`0026_…` after `0025_…`) and have a matching entry in `drizzle/meta/_journal.json`
  - run inside a single transaction — no `BEGIN`/`COMMIT`, `CONCURRENTLY` or `VACUUM`; a new enum value cannot be used in the same file that adds it
  - be additive relative to the code currently in production; drops and renames go in a later release, once nothing reads the old shape

### Module structure

Every feature module must follow this exact file structure:

```
module.route.ts        - route handlers
module.controller.ts   — request/response only, no business logic
module.service.ts      — business logic, orchestration
module.validation.ts   — zod schemas for request validation
module.repository.ts   — all DB queries via Drizzle ORM, no logic
```

- Controllers call services only
- Services call repositories only
- Repositories call the DB only — no business logic, no HTTP concerns
- Validation schemas live in `module.validation.ts` and are used in controllers before calling services

---

## Data model overview

### Auth tables

- `users` — single table for all user types. Flags: `is_customer`, `is_vendor_owner`. There is deliberately no `is_admin`: platform admin comes from a `super_admin` row in `user_member_mapping` or the env-credential break-glass login, never from a column or a JWT claim
- `user_member_mapping` — **the single role table for the whole product**: `(vendor_id, user_id, role, status)`. `role` is namespaced by scope — `user` / `super_admin` (both `vendor_id IS NULL`) and `vendor_admin` / `vendor_operator` (both `vendor_id NOT NULL`), enforced by a CHECK constraint. The absence of a row *is* the `user` role; baseline accounts are never materialized
- `otp_verifications` — stateless OTP log. `purpose`: `login` / `register` / `vendor_onboard`
- `refresh_tokens` — one row per session. Store SHA-256 hash of raw token, never plaintext

### Customer tables

- `user_addresses` — saved addresses with `lat/lng`. Doorstep location is snapshotted onto `bookings` at booking time
- `user_vehicles` — saved car profiles. `is_default` for auto-selection. `wash_interval_days` (0031) is the customer's wash reminder interval for Home's wash bar: 7/10/14/21/30 only (CHECK), null = the default, 14 days or 10 from 1 Oct to 31 Dec in IST (`lib/wash-status.ts`, Chennai-only and hard-coded). Set with `PATCH /users/me/vehicles/:id { washIntervalDays }`
- `users.updates_seen_at` (0031) — when the customer last opened Updates; anything after it is unread and lights Home's bell (null reads as `users.created_at`). `POST /users/me/updates/seen` only ever moves it forward, and never past the server's clock. 0031 set it to now for every existing account

### Vendor tables

- `vendors` — the company. `owner_id` names the one person who owns the business; `user_member_mapping` answers the separate question of who can use the portal and with what power. `is_verified` is flipped manually by admin. `slot_interval_mins` sets calendar granularity (30/45/60)
- `vendor_working_hours` — one row per day of week (0=Sun … 6=Sat). `is_closed` handles off days
- `vendor_service_areas` — pincodes/areas covered for doorstep jobs
- `vendor_photos` — ordered gallery. `sort_order` controls display sequence

### Catalog

- `services` — vendor-scoped. `category`: `car_wash` / `detailing` / `coating` / `scratch_removal` / `others` / `package`. `duration_mins` drives slot consumption
- `service_package_items` — composition of a package. A package is a `services` row with `category = 'package'` that bundles other services of the same vendor, so it books, prices and consumes slots exactly like a service and `bookings.service_id` stays a single FK. Its price and duration are vendor-set and independent of its members; the members exist to itemize contents and compute savings from their live prices
  - Listings that mean "plain services" MUST exclude `category = 'package'` (see `listServices`, and the admin repository — `listActiveServiceIds` especially, since the admin editor reconciles against it)
  - The booking path MUST NOT exclude packages — a package occupies a slot like any other service
  - Packages are created only via `/vendors/me/packages`; `POST /vendors/me/services` rejects `category: 'package'` because a package with no members is invalid
- Category labels live in `apps/server/src/lib/categories.ts` and `packages/core/src/categories.ts`, both keyed exhaustively on the category union — add new categories there or the build fails

### Transaction tables

- `bookings` — central entity. `booking_type`: `doorstep` / `dropin`. `scheduled_at` is the start timestamp. Doorstep lat/lng/address snapshotted from user address
- `payments` — 1:1 with bookings. Cash bookings: `status: pending` → `status: collected` on job completion
- Refunds (0029) are manual in the Razorpay dashboard; ops records each one (`POST /admin/refunds`). `payments`, `booking_intents` and `booking_charges` share five refund columns (`refunded_amount` is the running total of every refund so far; `refund_ref` (rfnd_… or null for UPI/bank, with `refund_note` saying how), `refunded_at`, `refunded_by` describe the latest); every refund is also a `refund_records` row (unique `refund_ref`, unique `(kind, target_id, refunded_before)`), written in the same transaction, and the write is conditional on the total the dialog saw (`expectedRefunded`). A full refund of a booking's payment moves it to `refunded`; a part refund leaves it `paid`. What is owed is decided only by `lib/refunds.ts`: a cancelled booking's paid payment (any canceller, garage no-show included) except a **customer no-show** and a booking the customer **moved** (a reschedule cancels the old row with its payment still `paid` — find it by `bookings.rescheduled_from_id`); a failed intent with a `payment_ref`; a paid bill on a cancelled booking (not a customer no-show); a payment recorded on a cancelled (replaced/withdrawn) bill. The refunds repository's SQL only narrows to candidates; keep it no narrower than the lib. Nothing that settles or fails a payment may write over `refunded` (see `settlePayment`, `markBookingPaid`)
- No-show money: a customer no-show keeps the payment, keeps the promo use spent (`DISCOUNT_HELD`/`DISCOUNT_REALIZED` and their pure twins in `discounts.predicates.ts`), and earns the garage its normal payout (`lib/earnings.ts`, labelled "Customer no-show" in earnings). A garage no-show is refunded in full and earns nothing
- `reviews` — unique on `booking_id`. Only allowed after `bookings.status = completed`
- `receipt_numbers` / `receipt_counters` (0030) — the customer receipt's number, `DTL/<FY>/<6-digit seq>` (`DTL/26-27/000123`, 16 chars; FY is 1 April–31 March in IST, `lib/receipts.ts`). **One per reschedule chain root** (`root_booking_id` = `originalBookingId ?? id`), issued once and **never reused or renumbered**, whatever later happens to the booking. **Gapless counter**: `allocateReceiptNumber` bumps the FY's `receipt_counters` row with `UPDATE … RETURNING` in the same transaction as the booking's own payment going through (`settlePayment`, `consumeIntent`, `markCashCollected`), so a rollback gives the number back — never a SEQUENCE. Not on a reschedule (the root has its number) or a final bill (printed on the booking's receipt). `GET /bookings/:id/receipt` issues a missing one as a safety net and logs a warning; if it can't, it answers 503 `RECEIPT_NUMBER_PENDING` and alerts ops. Any new path that marks a booking's payment paid/collected must call it. Because the bookings a number was issued on must stay, `DELETE /users/me` refuses an account that has one (409 `ACCOUNT_HAS_RECEIPTS`) rather than cascade into them
- `bookings.accepted_at` / `started_at` / `completed_at` — written by the same conditional update that moves the status (`updateBookingStatus`). Null on bookings from before 0028; never backfill a guessed time
- `job_photos` — a job's before/after photos (`stage`), the garage's evidence in a dispute. Key always under `vendors/<vendorId>/job-photos/<bookingId>/`; before from `confirmed`, after from `in_progress`, 6 per stage, frozen 7 days after completion (`lib/job-records.ts`). Customers see them once the job is `in_progress`
- `booking_charges` — money asked after checkout; today only `kind = 'final_bill'` of an inspection job (a booking with an `on_inspection` service), raised by the garage while `in_progress` or up to 3 days after completion. `amount_due = max(0, total_amount − paid_before)`; 0 is `not_needed` and nothing is refunded. `paid_before` is what the booking covers: its pre-discount `subtotal_amount` once its payment landed (`creditAtBooking`), never the discounted cash, so a promo code is not charged back and payout + balance equals the bill. Ops cancelling a booking withdraws its unpaid bill (`cancelBookingAsAdmin`); a payment that lands on a withdrawn, replaced or already-paid bill gets one refund note and one alert. At most one non-cancelled bill per booking (partial unique index); an unpaid one is replaced by cancelling it, a paid one is locked. Settling is conditional on `status = 'due'` and the bill's own `gateway_order_id`, because the app's verify and the webhook both arrive (`lib/final-bill.ts`)

### Home hub (0031)

- `GET /users/me/home` and `GET /users/me/updates` are mounted inside the users routes (`modules/home`, no second auth). Both are derived on every read; there is no event table. Updates covers the last 30 days, capped at 100 rows (`lib/home-updates.ts`); a step with no recorded time is skipped, never guessed. Order on Home (owner decision): one must-act card (bill due, then garage shut on a booking's day; `lib/home-cards.ts`) above the offers, "Rate your wash" below them only when there is no must-act card — at most two cards above the car. A notice about the customer's own booking is never a card: it rides on the Next booking tile and leads Updates
- The Home read is about a dozen sequential queries on the single connection (`db/index.ts` `max: 1`); `Promise.all` would not parallelise them. Keep the count low and every booking read bounded by the 30-day window. Each optional part (offers, notices, closures, last wash, Book again, nearby) is isolated: a failure returns that part as null and is reported, and Home still renders
- Money in a Drizzle relational read's nested rows (`with: { payment, charges, … }`) comes back through JSON, so `numeric(10,2)` 800.00 arrives as `"800"`. `modules/home/home.mappers.ts` puts the two decimals back; do the same in any new nested read that returns money. Book again judges its garage like the garage page does (active, verified, not paused, still offering that booking type) and needs a map pin only for doorstep (`garageTakesJobAgain`); offers and Nearby keep the pin rule
- `discounts` Home fields: `show_on_home`, `home_title` (3–60 chars, required with `ends_at` while shown — CHECK, and checked on the merged row in `discountsService`), `home_priority` 0 Normal / 1 High / 2 Top, `home_audience` (text + CHECK: `everyone` / `new_customers` / `booked_this_garage` / `near_this_garage` / `wash_due` / `car_type`), `home_audience_radius_km` (near only, default 10), `home_audience_vehicle_types` (car_type only). The card's small print is generated from the code's columns (`lib/offers.ts`), never typed. At most 3 offers: priority, then (targeting on) the customer's tie to the garage, then ends soonest, then newest. Limits are counted with `DISCOUNT_HELD` (`countHeldMany`), like `resolveDiscount`
- **The audience is display targeting only.** It decides who sees the card on Home; it never changes who may type the code at checkout — `resolveDiscount` must not read it. Every audience but `everyone` uses booking history, location or the customer's cars, so all of them are gated by `HOME_OFFER_TARGETING` (env, default off): while off, only `everyone` offers are shown, none of that data is read for offers, and the admin API refuses to set any other audience (409 `TARGETING_DISABLED`). Turn it on only in the release that updates the privacy policy. `GET /admin/discounts/home-config` tells the admin form; `GET /admin/discounts/home-reach` gives its "Estimated reach" by asking Home's own `offerSkipReason` of every customer (`lib/offer-reach.ts`), reading only the facts the chosen audience needs ("near" is measured from saved addresses there, since Home's live location is never stored). The admin preview's small print is a twin of `offerMetaLine` in `packages/core/src/offer-preview.ts`, and the notice link rule of `isAllowedNoticeLink` in `packages/core/src/notice-link.ts`, each with a parity test in `apps/server/src/lib`
- `notices` — team messages for Home and Updates: to everyone (`all`) or to customers with an upcoming booking in a window, optionally at one garage (`with_booking_between`). Never deleted: "End now" ends a live one at now and switches a scheduled one off (`lib/notices.ts`; an end before the start breaks the window CHECK). Links are `https://…` or an app path, never `//host`, and never contain a backslash or whitespace (browsers read `/\evil.com` as `//evil.com`); the CHECK and `isAllowedNoticeLink` hold the same rule. Titles, bodies and link labels, like offer titles, pass `lib/copy-rules.ts` (twinned in `packages/core/src/copy-rules.ts`, with a parity test). Not the legal change-notice channel (Terms §19, Privacy §13 promise WhatsApp or a call)
- `notice_dismissals`, `offer_dismissals` — a customer's × on a notice or an offer, kept on the server so it holds on every device; both cascade with the user. `bookings.review_prompt_dismissed_at` is the × on "Rate your wash" (`POST /bookings/:id/review-prompt/dismiss`, owner only, 404 otherwise)

---

## Slot availability logic

Do NOT store slots in the DB. Generate them dynamically (`apps/server/src/lib/slots.ts`):

```ts
day        = dayStatus(paused?, holiday?, weekly hours)   // paused > holiday > weekly off day
day_slots  = starts from open_time every slot_interval_mins whose whole job
             (the sum of the services' durations) ends by close_time
noticed    = day_slots - starts sooner than the minimum notice (1h at garage, 3h doorstep)
busy       = bookings WHERE vendor_id = ? AND status IN (pending, confirmed, in_progress)
             AND payment is paid/collected, starting that IST day (or the day before)
             // each range = [scheduled_at, scheduled_at + bookings.duration_mins)
free_slots = noticed - starts where the peak number of busy jobs during the new
             job's range is already >= bays, or the day already has jobs_per_day jobs
```

- **Capacity**: `vendors.bays` is how many cars a garage works on at once (null or 0 = 1). `vendors.jobs_per_day` is an optional cap per IST day (null = no cap). Back-to-back jobs do not overlap; a booking holds capacity for its own `duration_mins` snapshot. Cancelled and completed bookings hold nothing.
- **Holidays**: a `vendor_closures` row for the IST date makes it a closed day (`isClosed: true, closedReason: 'holiday'`). **Paused**: `vendors.bookings_paused_at` set means no slots on any day (`paused: true`), no checkout, and absent from every public list/search/map — but the garage page still loads. Neither touches existing bookings.
- The same rules run twice: in the slot list / pre-payment checks, and again inside the transaction that writes the booking (`checkGarageCanTake` in bookings.repository.ts) under a per-garage-per-IST-day advisory lock. Keep the two in step — both read the pure functions in `lib/slots.ts`.
- Advisory locks are always taken in one order: vehicle → reschedule chain → the booking's own row (FOR UPDATE when moving it, FOR NO KEY UPDATE in `settlePayment`) → vendor-day → discount → the chain root's row FOR KEY SHARE → the receipt counter's row lock, last of all; nothing is locked after it (see the comment above `lockVehicle`). The root's KEY SHARE is the lock the `receipt_numbers` foreign key check would otherwise take after the counter, so `allocateReceiptNumber` takes it first. Add any new lock to that list.
- An unpaid booking holds nothing, so paying for one later is a booking write too: `POST /payments/orders` refuses a full/closed/paused garage up front, and `paymentsRepository.settlePayment` re-checks under the vendor-day lock when the money lands (a refusal cancels the booking and flags the payment for refund).
- A reschedule leaves the booking being moved out of the count, everywhere: the write, the pre-check, and the picker's list (`GET /vendors/:id/slots/reschedule/:bookingId`).
- Refusals: 409 `SLOT_FULL`, 400 `GARAGE_CLOSED_THAT_DAY`, 409 `GARAGE_PAUSED`. After payment they become refund-due intent failures (`slot_full`, `garage_closed`, `garage_paused`).

---

## Booking status flow

```
pending → confirmed → in_progress → completed
       → cancelled (from any state before completed)
```

---

## Payment status flow

```
Online:  pending → paid → refunded   (refunded only when ops records a full refund)
Cash:    pending → collected
Failed:  pending → failed
```



## Key constraints

- One review per booking — unique constraint on `reviews.booking_id`
- Doorstep bookings require `vendors.doorstep_enabled = true` and a matching `vendor_service_areas` row for the customer's location
- Drop-in bookings require `vendors.dropin_enabled = true`
- Vendor listings are only shown when `vendors.status = active` AND `vendors.is_verified = true`
- A user can be both a customer and a vendor member — check `is_customer` independently of their mapping rows
- **The active `vendorId` is produced by `resolveTenant` and read from context. No handler, service or repository ever reads it from a request parameter** — that is what keeps `X-Vendor-Id` from turning every vendor endpoint into an IDOR candidate
- A mapping miss returns 404, never 403 — a 403 confirms the company exists and leaks the id space
- Every read of `user_member_mapping` must filter `status = 'active'`. Miss it in one place and a suspended member still has access
- The vendor-app login gate is "active seat **or** `is_vendor_owner`". The second clause is the onboarding window: `vendor_onboard` sets the flag when the OTP is verified, but the company — and so the mapping row — is not created until onboarding step 2. Member management keeps the flag in step with the seats, so this does not let a suspended member back in
- Vendor routes default deny: a new route under `/vendors/me` is `vendor_admin`-only until someone deliberately widens it with `requireVendorRole`
- The owner's mapping row cannot be removed, demoted **or suspended** by anyone, including the owner. That is what guarantees at least one active `vendor_admin` always exists. Ownership moves only by explicit transfer
- Vendor-facing booking payloads carry no `vendorPayoutAmount`, `subtotalAmount`, `discountAmount` or `discountFundedBy` — money lives behind `GET /vendors/me/earnings`, which is `vendor_admin`-only. Use `toVendorBookingResponse` for any new vendor endpoint. The final bill (`finalBill`, and `paidAtBooking`, what the booking covers toward it) is in the vendor payload on purpose: it is what the garage itself asked the customer for, not the payout split
- Job records are mounted under `/vendors/me/bookings/:id/{photos,final-bill}` and are deliberately widened to `vendor_operator` in their own route files — the people who do the work take the photos and write the bill. The customer pays a bill at `/bookings/:id/charges/:chargeId/{pay,verify}`; anyone but the booking's customer gets a 404
- A Razorpay order's notes name what it pays for: `intent_id`, `booking_id`, or `charge_id` (with its `booking_id`). The webhook checks `charge_id` first, then a bill by `gateway_order_id` (a payment can arrive without its order's notes)

<!-- END:nextjs-agent-rules -->
