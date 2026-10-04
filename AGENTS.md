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
- `user_vehicles` — saved car profiles. `is_default` for auto-selection

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
- `reviews` — unique on `booking_id`. Only allowed after `bookings.status = completed`

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
- Advisory locks are always taken in one order: vehicle → reschedule chain → vendor-day → discount (see the comment above `lockVehicle`). Add any new lock to that list.
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
Online:  pending → paid → refunded
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
- Vendor-facing booking payloads carry no `vendorPayoutAmount`, `subtotalAmount`, `discountAmount` or `discountFundedBy` — money lives behind `GET /vendors/me/earnings`, which is `vendor_admin`-only. Use `toVendorBookingResponse` for any new vendor endpoint

<!-- END:nextjs-agent-rules -->
