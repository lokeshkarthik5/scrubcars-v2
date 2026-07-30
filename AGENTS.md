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

- `users` — single table for all user types. Flags: `is_customer`, `is_vendor_owner`, `is_admin`
- `otp_verifications` — stateless OTP log. `purpose`: `login` / `register` / `vendor_onboard`
- `refresh_tokens` — one row per session. Store SHA-256 hash of raw token, never plaintext

### Customer tables

- `user_addresses` — saved addresses with `lat/lng`. Doorstep location is snapshotted onto `bookings` at booking time
- `user_vehicles` — saved car profiles. `is_default` for auto-selection

### Vendor tables

- `vendors` — core vendor record. `is_verified` is flipped manually by admin. `slot_interval_mins` sets calendar granularity (30/45/60)
- `vendor_working_hours` — one row per day of week (0=Sun … 6=Sat). `is_closed` handles off days
- `vendor_service_areas` — pincodes/areas covered for doorstep jobs
- `vendor_photos` — ordered gallery. `sort_order` controls display sequence

### Catalog

- `services` — vendor-scoped. `category`: `car_wash` / `detailing` / `coating` / `scratch_removal`. `duration_mins` drives slot consumption

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

---

## Key constraints

- One review per booking — unique constraint on `reviews.booking_id`
- Doorstep bookings require `vendors.doorstep_enabled = true` and a matching `vendor_service_areas` row for the customer's location
- Drop-in bookings require `vendors.dropin_enabled = true`
- Vendor listings are only shown when `vendors.status = active` AND `vendors.is_verified = true`
- A user can be both a customer and a vendor owner — check `is_customer` and `is_vendor_owner` flags independently

<!-- END:nextjs-agent-rules -->
