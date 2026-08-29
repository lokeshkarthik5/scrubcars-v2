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
- Category labels live in `server/src/lib/categories.ts` and `web/lib/categories.ts`, both keyed exhaustively on the category union — add new categories there or the build fails

### Transaction tables

- `bookings` — central entity. `booking_type`: `doorstep` / `dropin`. `scheduled_at` is the start timestamp. Doorstep lat/lng/address snapshotted from user address
- `payments` — 1:1 with bookings. Cash bookings: `status: pending` → `status: collected` on job completion
- `reviews` — unique on `booking_id`. Only allowed after `bookings.status = completed`

---

## Slot availability logic

Do NOT store slots in the DB. Generate them dynamically:

```ts
available_slots = generate_slots(open_time, close_time, slot_interval_mins)
booked_ranges   = bookings WHERE vendor_id = ? AND date = ? AND status != 'cancelled'
                  // each range = scheduled_at to scheduled_at + service.duration_mins
free_slots      = available_slots - booked_ranges
slots_needed    = ceil(service.duration_mins / vendor.slot_interval_mins)
```

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
