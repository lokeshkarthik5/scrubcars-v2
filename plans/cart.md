# Multi-service bookings ("cart") — scope

Status: **built.** Steps 1–5 of §3 are done; the deprecation pass (step 6) is
not. The §5 assumptions were taken as decided — one vendor, one vehicle,
summed duration, no quantities, no post-booking line edits, packages unchanged.
Revisit §5 if any of those were wrong; each is a real design decision, not an
implementation detail.

What shipped, against the plan:

- `booking_items` + `booking_intent_items` with name/price/duration snapshots,
  backfilled from every existing booking (`drizzle/0024_add_booking_items.sql`).
  **Not yet applied to any database** — run `bun run migrate` in `apps/server`.
- `bookings.duration_mins`, which also fixes a latent bug: the vehicle-overlap
  check joined `services.duration_mins`, so a vendor editing a duration moved
  the window of every booking already taken against it.
- `bookings.service_id` nullable, still written with the first item. Every
  pre-existing reader is untouched and still correct.
- `resolveBookingDraft` prices a list; totals are summed in paise via
  `sumAmounts`, now shared with the discount preview so the two cannot disagree.
- Slots, the discount preview and the booking API all take a list, and all
  still accept the old single-`serviceId` shape.
- Customer garage/checkout screens are a real cart with per-line removal;
  vendor, admin, earnings and review surfaces name every service.
- Tests for `sumAmounts`, `computeServiceAmount`, `computeAvailableSlots` and
  the request-shape normalisation — the repo's first (`bun test`).

Also fixed on the way, because multi-select made it unavoidable: the checkout
screen only ever fetched `/services`, which excludes packages, so a customer
who added a **package** on the garage page arrived at checkout with it silently
dropped. It now fetches packages too.

Today a booking is exactly one service. `bookings.service_id` is a single
non-null FK (`apps/server/src/db/schema.ts:577`), `createBookingSchema` takes one
`serviceId` (`bookings.validation.ts:42`), and the garage screen keeps
`selected: string | null` with tap-to-replace
(`apps/users/app/garage/[id]/page.tsx:63,117`). The checkout screen borrows the
look of a cart (`book/[vendorId]/page.tsx:363`, "the Urban Company cart shape")
but summarises one line.

The one existing multi-service path is **packages**: a `services` row with
`category = 'package'` plus `service_package_items` members
(`schema.ts:540`). A package books through the ordinary single-`serviceId`
path — it is one priced, one duration, one row. That is the precedent this
feature generalises, and it is also why a cart may be partly redundant (§6.6).

---

## 1. What has to change, by layer

### 1.1 Data model — the real work

Introduce `booking_items`, one row per service in a booking:

```
booking_items
  id, booking_id -> bookings.id (cascade)
  service_id     -> services.id (restrict)
  vehicle_id     -> user_vehicles.id (restrict)   # only if per-item vehicles (§6.3)
  quantity       integer default 1                 # only if quantities (§6.4)
  -- snapshots, taken at booking time for the same reason booking_intents
  -- snapshots everything (schema.ts:793): a vendor editing a price or
  -- duration later must not change what the customer agreed to.
  name, unit_amount, line_amount, duration_mins
  sort_order
```

`booking_intents` needs the mirror table (`booking_intent_items`) or a JSONB
snapshot — the intent is what Razorpay's amount is derived from, and it already
carries `serviceId` + `serviceDurationMins` per intent (`schema.ts:806,813`).

**Migration strategy.** `bookings.service_id` is read in ~15 files. Do not drop
it in the same pass:

1. Migration adds the item tables; backfills exactly one row per existing
   booking and intent from the current `service_id`/amount/duration.
2. `bookings.service_id` becomes **nullable and derived** — keep writing the
   first item's service into it for a deprecation window so every existing read
   path (vendor lists, earnings, admin, review context) keeps working unchanged.
3. A later pass migrates readers to the items and drops the column.

Skipping step 2 turns this into a big-bang change across four apps.

### 1.2 Pricing and validation

`resolveBookingDraft` (`bookings.service.ts:364-470`) is the single choke point —
it validates the slot, the booking type, the per-vehicle price, and the promo
code, and both `createBooking` and the payment-intent flow go through it. It
stays the choke point; it becomes a loop:

- `findServiceForVendor` → `findServicesForVendor(vendorId, serviceIds[])`, with
  a check that **every** id belongs to this vendor and is active.
- `computeServiceAmount(service, vehicleType)` runs per item. Its null case
  ("not priced for your vehicle type", line 441) must now name *which* service
  failed, or the customer cannot tell what to remove.
- `subtotal = Σ line_amount`. Rounding: sum the lines, then discount — never
  discount per line — or the invariant `amount = subtotalAmount - discountAmount`
  (`schema.ts:589`) drifts by a paisa.

### 1.3 Discounts — smaller than it looks

Discounts are already **order-level**: one code per booking, resolved against a
server-computed subtotal (`discounts.service.ts:236`). The `serviceId` in
`findPricingContext` (`discounts.repository.ts:174`) exists only to recompute
that subtotal for the preview endpoint, not to scope a code to a service.

So the change is: the preview endpoint takes a list instead of one id, and
`minOrderAmount` starts comparing against a cart total. `validateDiscountSchema`
(`discounts.validation.ts:30`) changes shape, and so does `useValidateDiscount`
and the promo UI in `book/[vendorId]/page.tsx`.

Watch: a cart makes `minOrderAmount` far easier to clear, and `maxDiscountAmount`
now caps a much larger order. Existing live codes should be reviewed before this
ships — that is a business decision, not a code one.

### 1.4 Slots and duration — smaller than it looks

`lib/slots.ts:1-10` says it outright: **vendor capacity is unlimited today.** An
existing booking never blocks a slot; `serviceDurationMins` only decides whether
the job fits before closing time (`computeAvailableSlots`, line 46). So multi-
service means passing `Σ duration_mins` instead of one duration, in three places:
the slots endpoint, `isScheduledAtAvailable`, and the reschedule path
(`bookings.service.ts:569,805`).

Real consequence: a five-item cart may fit no slot at all on a short day, and the
picker will just render empty. That needs a message ("this combination needs
3h 20m — try a shorter list or another day"), not a blank sheet.

When per-vendor capacity lands (`vendors.bays` is stored but unused), a cart makes
overlap checking materially harder — longer blocks collide more. Worth knowing
now; not a reason to block this.

### 1.5 UI

- **Garage page** (`garage/[id]/page.tsx`): `selected: string | null` →
  `selected: string[]`; the toggle at line 117 becomes add/remove; the sticky
  footer (line 556) becomes "N services · ₹X · Book". The details-popup button
  already says "Add to booking"/"Remove from booking" (line 725) — the copy is
  ready for this, the state is not.
- **Book page** (`book/[vendorId]/page.tsx`): the summary becomes a real line-item
  list with per-line remove; `selectedService` → `selectedServices`; the
  `serviceId` query param becomes a list (or a stashed cart in
  `packages/core/src/stores/`).
- **Vendors app**: `serviceName` is rendered as a bare string in three places
  (`bookings/page.tsx:107`, `home/page.tsx:142`, `earnings/page.tsx:116`). Each
  needs "Full wash +2 more" or a stacked list. A vendor seeing only the first
  service of a three-service job is the worst failure mode in this whole feature.
- **Users app**: `bookings/page.tsx:61`, `bookings/[id]/page.tsx:98,206,261` —
  same treatment; the detail page's price breakdown becomes per-line.
- `mapBooking` (`packages/core/src/api/mappers.ts:232-239`) flattens
  `serviceId`/`serviceName`/`servicePrice` onto the booking. Add `items[]` and
  keep the flat fields as derived-from-first-item for the deprecation window.

### 1.6 Untouched

Payments/Razorpay (`amount` is already one figure), reschedule chain, cancellation,
reviews (per booking, `bookingContext` is a service name — becomes "N services"),
payouts (reads `amount`).

---

## 2. Sizing

| Layer | Size | Why |
|---|---|---|
| Migration + backfill | M | Two tables, two backfills, nullable-column window |
| `resolveBookingDraft` + repo | M | One function, but it is *the* money path |
| Intents/confirm transaction | M | Snapshot items atomically with the booking |
| Discounts | S | Already order-level; input shape only |
| Slots | S | Sum a number; add an empty-picker message |
| Users app UI | L | Two screens rebuilt around a list |
| Vendors + admin UI | M | Read-only, but four surfaces |
| **Total** | **~L** | Roughly a week of focused work, plus decisions |

There are **no tests in this repo** (`find -name '*.test.ts'` → nothing). Every
guarantee here is currently held by hand-checking. For a change that rewrites the
pricing path, that is the biggest risk on the list — I would write tests for
`resolveBookingDraft` and `computeServiceAmount` *before* touching them.

---

## 3. Recommended sequence

1. Tests around `resolveBookingDraft`, `computeServiceAmount`, `computeAvailableSlots`.
2. Migration + backfill; `service_id` nullable, still written.
3. Server: array-shaped input, item snapshots, summed duration, discount preview.
   Accept the old single-`serviceId` body shape too, so nothing breaks mid-deploy.
4. Users app: garage multi-select → cart checkout.
5. Vendors/admin/users read surfaces.
6. Later pass: migrate readers off `bookings.service_id`, drop it.

Steps 2-3 ship behind the old client without user-visible change — that is the
point of the ordering.

---

## 4. Risks

- **Silent partial display.** Any surface still reading `booking.serviceName`
  after multi-item ships shows one service for a job that has three. Grep for
  `serviceName` before declaring done.
- **Price drift between intent and booking.** Items must be snapshotted into the
  intent and copied to the booking inside the same transaction as
  `confirmIntent`, or a mid-checkout price edit re-opens exactly the bug the
  intent model was built to close (`schema.ts:785-795`).
- **Discount economics.** §1.3.
- **Empty slot picker.** §1.4.

---

## 5. Open decisions

1. **One vendor per cart?** Assumed yes — slots, address and payout are all
   per-vendor. Cross-vendor carts are a different, much larger feature.
2. **Sequential duration?** Assumed `Σ duration`. If a garage can run two jobs on
   one car in parallel, this over-books time.
3. **One vehicle per booking, or per line?** Assumed one — "wash my car and my
   wife's car in one booking" is a real ask but doubles the model's complexity
   and breaks the single `vehicle_id` on the booking.
4. **Quantities?** Assumed no — two of the same service on one car is unusual.
5. **Post-booking edits?** Can a customer or vendor remove one line from a
   confirmed booking? Assumed no — that is a partial refund, a separate feature.
6. **What happens to packages?** A cart overlaps them. Options: keep both
   (packages stay the discounted, vendor-curated bundle; the cart is ad-hoc),
   or let packages expand into cart lines on add. Assumed keep both, unchanged.
