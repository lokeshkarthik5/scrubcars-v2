# Changelog — API

Hono API, Drizzle schema and migrations. Versioned independently of the web app;
see `web/CHANGELOG.md` for that side.

The version lives in `server/package.json` and is read at boot by
`src/lib/version.ts`. It is printed on the boot line, attached to the
`server:start` log, and served by `GET /` — the last of those matters on
serverless, where the boot line never runs. Bump the version and add a section
here in the same commit.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Dates before 0.2.0 come from the git history and summarise commits rather than
reconstructing every change in them.

## [Unreleased]

### Added

- **Recording refunds** (migration `0029_record_refunds`, which must be
  applied before deploying). Refunds stay manual in the Razorpay dashboard;
  ops now records each one. `payments`, `booking_intents` and
  `booking_charges` gain `refunded_amount` (running total), `refund_ref`
  (rfnd_…, or null when refunded by UPI/bank), `refunded_at`, `refunded_by`
  and `refund_note`, with a CHECK that the total never passes what was paid,
  and `bookings` gains an index on `rescheduled_from_id`. What is owed lives
  in `lib/refunds.ts`: a cancelled booking's paid payment (whoever cancelled,
  a garage no-show included) except a customer no-show or a booking the
  customer moved; a failed checkout with a captured payment; a paid final
  bill on a cancelled booking (not a customer no-show); a payment that landed
  on a replaced or withdrawn bill. A second payment on an already-paid bill is
  still only a booking note, so it is not listed. The same migration adds
  `refund_records`: one row per refund recorded (the money rows keep only the
  running total and the latest), with a unique index on `refund_ref` so one
  Razorpay refund can't be recorded on two customers, and one on
  `(kind, target_id, refunded_before)` so the same refund can't be recorded
  twice.
- **Rollout: clear the refunds already done by hand.** Until now nothing
  marked a refund on its row, so every refund already done in Razorpay still
  reads `payments.status = 'paid'` on a cancelled booking (or a failed
  checkout with a `payment_ref`). Once deployed, each one would show as owed
  on the Refunds page and the pilot card, and the customer's booking page
  would promise a refund they already have. Right after applying 0029 and
  before deploying the apps, list them (read-only):

  ```sql
  select 'booking' as kind, b.id, p.amount, p.gateway_txn_id as razorpay_payment_id, b.cancelled_at as since
    from bookings b join payments p on p.booking_id = b.id
   where b.status = 'cancelled' and p.status = 'paid'
     and (b.no_show is null or b.no_show <> 'customer')
     and not exists (select 1 from bookings m where m.rescheduled_from_id = b.id)
  union all
  select 'checkout', i.id, i.amount, i.payment_ref, i.created_at
    from booking_intents i
   where i.status = 'failed' and i.payment_ref is not null
  union all
  select 'bill', c.id, c.amount_due, c.gateway_payment_id, c.updated_at
    from booking_charges c join bookings b on b.id = c.booking_id
   where (c.status = 'cancelled' and c.gateway_payment_id is not null)
      or (c.status = 'paid' and b.status = 'cancelled'
          and (b.no_show is null or b.no_show <> 'customer'))
  order by since;
  ```

  Ops checks each payment id in the Razorpay dashboard and records the ones
  already refunded on the admin Refunds page as soon as it is live ("Mark
  refunded…" with the real rfnd_ id, or "Refunded outside Razorpay" with a
  note such as "Refunded before refunds were recorded"). What is left is
  money still owed. If the backlog can't be cleared before launch, a one-off
  hand-run UPDATE (never in a migration) may mark the confirmed ones
  refunded, with `refund_note` saying so and a `refund_records` row each —
  only for payments confirmed refunded in Razorpay.
- `GET /admin/refunds?status=owed|done` lists refunds (kind `booking` /
  `checkout` / `bill`, customer, garage, paid / refunded / owed, Razorpay
  payment id, why and since when, and the refund once done). `POST
  /admin/refunds` `{ kind, id, amount, refundRef | outsideRazorpayNote, note? }`
  records a full or part refund (part refunds add up): refused when not owed
  (`REFUND_NOT_DUE`), above what is owed (`REFUND_TOO_MUCH`), already refunded
  in full (409 `ALREADY_REFUNDED`), under a refund id already recorded on any
  refund (409 `REFUND_REF_USED`) or when the figures moved first (409
  `REFUND_STATE_CHANGED`). The write is conditional on the running total the
  caller saw (optional `expectedRefunded`, which the admin dialog always
  sends; the total read otherwise), so a retry after a lost response is
  refused rather than recorded twice. A full refund of a booking's payment
  moves it to `refunded`. Leaves a booking note and sends a `refund_recorded`
  Telegram alert; the `paid_no_booking` alert now links the Refunds page.
- Admin booking rows carry `refundOwed` and `refunded`; the detail carries
  `refunds`. The pilot numbers add `refundsOwed`, `refundsOwedAmount` (all
  still owed) and `refunded`, `refundedAmount` (recorded in the window), and
  revenue is kept money less refunds.
- Customer booking payloads carry `refund` `{ status: owed | refunded | none,
  amount, amountRefunded, refundedAt }` — never owed on a customer no-show,
  and no refund ids or names. Garage payloads leave it out.
- Garage **earnings** include customer no-shows on a kept payment at the
  normal payout (`kind: 'customer_no_show'` on the job); garage no-shows and
  other cancellations still earn nothing. `jobsDone` counts jobs done only.

### Changed

- A promo code used on a booking the customer didn't turn up for stays used:
  `DISCOUNT_HELD` and `DISCOUNT_REALIZED` count customer no-shows. Every other
  cancellation still gives the use back.
- `GET /bookings/vendor` keeps bookings whose payment is `refunded`: a
  declined booking or the garage's own no-show stays on its Cancelled tab
  after the customer is refunded in full. Accepting and capacity still need
  `paid`.
- A payment ops has refunded is never moved back to `paid` or `failed` by a
  late webhook or verify call, and a refunded booking can't be paid again
  (`PAYMENT_REFUNDED`).


- **Job records** (migration `0028_job_records_and_final_bill`, which must be
  applied before deploying): `bookings.accepted_at`, `started_at` and
  `completed_at`, stamped by the same conditional write that moves the status,
  and on every booking payload (customer, garage, admin). Older bookings keep
  them null.
- **Job photos** (`job_photos`): `GET/POST /vendors/me/bookings/:id/photos`,
  `POST …/photos/upload-url` (`{ stage, contentType }`, a presigned R2 upload
  under `vendors/<vendorId>/job-photos/<bookingId>/`), `DELETE
  …/photos/:photoId`. Open to `vendor_admin` and `vendor_operator`; a job of
  another garage is a 404. Before photos from acceptance, after photos once
  started, six per stage, frozen a week after completion; a key outside the
  job's folder is refused (`INVALID_JOB_PHOTO_KEY`). Customers get them on
  their booking once the work has started. Rules in `lib/job-records.ts`.
- **Final bill for inspection jobs** (`booking_charges`): the garage raises
  it with `POST /vendors/me/bookings/:id/final-bill` (1–20 lines, optional
  note) on a booking with an on-inspection service, while in progress or up
  to 3 days after completion, replacing an unpaid one; a paid one is locked
  (`FINAL_BILL_PAID`). `amount_due` = max(0, total − `paid_before`), where
  `paid_before` is the booking's pre-discount price once its payment landed
  (so a promo code is not charged back, and the garage's payout plus the
  balance equals its bill); none due is `not_needed`, with nothing refunded.
  Booking payloads with job records carry `paidAtBooking`, the same figure.
  The customer pays the balance
  with `POST /bookings/:id/charges/:chargeId/pay` (one Razorpay order per
  bill, reused on every tap) and `…/verify`; the webhook settles a captured
  payment whose notes carry `charge_id`, or whose order id is a bill's
  (amount must match). Settling is
  conditional on the bill still being due, so the app and the webhook cannot
  both settle it; a payment landing on a bill the garage replaced, on a
  booking ops cancelled (which withdraws an unpaid bill), or on a bill already
  paid is recorded with one internal note and one `final_bill_refund_due`
  alert, and the app is told it will be refunded (`FINAL_BILL_REFUND_DUE`).
  Telegram alerts when a bill with a balance is raised and when it is paid.
  Rules in `lib/final-bill.ts`.
- Garage **earnings** include final bills paid in the app; the **pilot
  numbers** count them in revenue and add the median minutes from payment to
  the garage accepting (`medianAcceptMins`, null under three accepts in the
  window, with `acceptSamples`). The admin booking list flags a bill still due
  (`billDue`); the detail carries the bill with its Razorpay ids, the bills it
  replaced, and the photos.

- **`GET /api/v1/health`** for the uptime monitor: runs `select 1` and
  answers `{ status: 'ok', db: 'ok', version }`, or 503 with `db: 'down'`
  when the database fails or takes over 3 seconds. Public, uncached.
- **`GET /api/v1/booking-intents/:id`**: where a checkout stands (`pending`,
  `consumed` with its `bookingId`, or `failed` with `failureReason` and the
  customer's refund `message`). The customer's own only; anyone else's is a
  404.
- **`GET /api/v1/admin/stats/pilot?days=7|30`** (super admin): the checkout
  funnel, how bookings ended, revenue and the top five garages, from existing
  tables. Definitions and tests in `lib/pilot-stats.ts`. A rescheduled
  booking counts once, as the latest row of its chain, in the window of its
  first booking; it is not a customer cancellation. Revenue and the garage
  ranking leave out cancelled bookings (the money goes back), except customer
  no-shows, where the payment is kept. (Time-to-accept arrives with
  `accepted_at`; see job records above.)
- **Per-phone limit on login codes**, counted from `otp_verifications` (no new
  table): one every 30 seconds and five per rolling hour. Refused with 429
  `OTP_RATE_LIMITED`, a message saying how long to wait, `retryAfterSeconds`
  in the body and a `Retry-After` header. The per-IP limiter stays. A code
  the SMS provider definitely refused is deleted, so a provider outage does
  not use up anyone's sends; after a timeout, network error or 5xx the SMS
  may still arrive, so that code stays valid and counted.
- **Telegram alert when the SMS provider fails** (`sms_failed`): the masked
  number and the provider's message, at most once per 10 minutes per server
  instance.
- **Crash reporting with Sentry** (`@sentry/node`), off — and not even loaded —
  unless `SENTRY_DSN` is set. Reports only unexpected errors from
  `app.onError` (not `AppError`s) and failed background tasks; no traces,
  request bodies, headers or cookies, and phone numbers and 6-digit codes
  scrubbed (`lib/scrub.ts`).

- **Team alerts in Telegram** (`lib/ops-alerts.ts`): a new paid booking, a
  payment that produced no booking (refund due), a garage decline, a customer
  cancel and a reschedule post to the team group. Production only; never fail
  or slow the booking (`@vercel/functions` waitUntil).
- **30-minute nudge** (`POST /api/v1/ops/pending-digest`, behind
  `CRON_SECRET`): an outside scheduler calls it every 10 minutes; it lists paid
  bookings no garage has accepted after 30 minutes, and those whose time passed
  unaccepted (refund due). Quiet 22:00–07:00 IST, with a 7 am roll-up.
- **Admin booking operations** (migration `0026_admin_booking_ops`, which must
  be applied before this API deploys — every booking read selects the new
  columns):
  - `GET /admin/bookings` takes `q` (reference, customer phone or name, garage
    name), `vendorId`, `from`/`to` (IST dates), `limit` and `cursor` (`page`
    still works for older callers), and each
    row carries the reference, waiting minutes, the Razorpay payment id, the
    garage and customer contacts, the car, the cancellation and no-show, and a
    notes count. The old fields stay for panels deployed before this.
  - `GET /admin/bookings/:id`: the full booking, its reschedule links, who
    accepted and completed it, and its notes.
  - `POST /admin/bookings/:id/cancel` (`onBehalfOf` customer / garage /
    detlio, required `reason`): from pending, confirmed or in progress, with
    no cutoff. A paid one posts a refund-due Telegram alert.
  - `POST /admin/bookings/:id/no-show` (`party` customer / garage): only for an
    accepted booking whose start time has passed (`NO_SHOW_TOO_EARLY`). A
    customer no-show keeps the payment; a garage no-show posts a refund-due
    alert.
  - `POST /admin/bookings/:id/notes`: internal notes, signed by the admin who
    wrote them. Cancelling and marking a no-show add one on their own. Notes
    are never in a customer or garage payload.
- **Customer and garage booking payloads** carry `cancelledOnBehalfOf` and
  `noShow`; `cancelledBy` can now be `admin`.
- **Bay capacity.** A garage runs at most `vendors.bays` jobs at once (null or
  0 = 1) and, when `jobs_per_day` is set, at most that many in an IST day.
  Pending, confirmed and in-progress bookings that are paid hold their
  `[scheduled_at, + duration_mins)`. The slot list leaves full times out (and
  reports `fullSlots`); checkout and reschedule refuse one with 409
  `SLOT_FULL`, re-checked under a per-garage-per-day advisory lock where the
  booking is written. A payment that lands after the last bay went becomes a
  refund-due failure, `slot_full`.
- **`GET /vendors/:id/slots/reschedule/:bookingId`** (signed-in customer, their
  own booking at that garage, else 404): the slot list for moving a booking,
  with that booking left out of the garage's capacity, so a one-bay garage
  still offers the times around it.
- **Holidays and pausing** (migration `0027_vendor_closures_and_pause`, which
  must be applied before this API deploys — every vendor read selects the new
  columns):
  - `GET/POST /vendors/me/closures`, `DELETE /vendors/me/closures/:id`
    (vendor_admin): a date from today to a year ahead; POST returns the
    bookings still on that day. A holiday offers no slots (`isClosed: true`,
    `closedReason: 'holiday'`) and refuses checkout and reschedule with 400
    `GARAGE_CLOSED_THAT_DAY`.
  - `POST /vendors/me/pause` (`reason` optional) and `POST /vendors/me/resume`
    (vendor_admin), and `POST /admin/vendors/:id/pause|resume`. A paused
    garage is left out of the list, search and map, its slot list says
    `paused: true`, and checkout and reschedule are refused with 409
    `GARAGE_PAUSED`. Its page still loads, with `bookingsPausedAt` and
    `bookingsPausedReason`.
  - `GET /vendors/:id/closures`: the next 60 days' holidays, for the picker.
    List items carry the coming week's as `closures`.
  - Neither touches existing bookings. A payment that lands after either
    becomes a refund-due failure (`garage_closed`, `garage_paused`).

### Changed

- **Admin vendor edit** takes per-day `workingHours` and changes only the days
  sent; the panel sends them only when the admin edited the hours. Saving any
  other field no longer resets a garage's week to one schedule.
  `workingDays` + `openTime`/`closeTime` still work for older callers.
- **Deleting a garage that has bookings** is refused with 409
  `VENDOR_HAS_BOOKINGS` ("This garage has bookings. Archive it instead.").
  It used to cascade through every booking, payment and review.
- **Deleting a service or package that a booking or checkout names** is
  refused with 409 `SERVICE_IN_USE` ("This service has bookings. Disable it
  instead.", or "This package …") instead of a 500.
- **Paying for an unpaid booking later** (`POST /payments/orders`, then verify
  or the webhook) runs the garage checks too. The order is refused up front
  with `SLOT_FULL`, `GARAGE_PAUSED` or `GARAGE_CLOSED_THAT_DAY`; a payment that
  lands anyway is recorded as paid, the booking is cancelled (by Detlio, with
  an internal note), ops get the "payment taken, no booking" alert, and the
  customer gets 409 `BOOKING_CONFIRM_FAILED_REFUND_DUE`. Until now an unpaid
  booking held no bay, and paying for it took one without asking.
- **Rescheduling at a paused garage** is refused with its own words ("This
  garage isn't taking changes right now. Your booking stays at its current
  time, or you can cancel it."), still 409 `GARAGE_PAUSED`.
- **Admin vendor edit** checks per-day hours before writing anything, so an
  invalid day no longer returns 400 after the rest of the save went through.
- **Switching doorstep on** needs a travel radius or a drawn area
  (`DOORSTEP_RADIUS_REQUIRED`, which now says where to set it);
  `PATCH /vendors/me/job-types` takes `doorstepRadiusKm` (1–30) so the two can
  be set together.
- **`PATCH /vendors/me`** takes `bays` 1–20 and `jobsPerDay` 1–500 or `null`
  (no limit).
- **OTP attempts are counted atomically.** Each guess claims an attempt in one
  `UPDATE … WHERE attempts < cap RETURNING` before it is compared, the cap
  worked out from the window's other codes only, so guesses sent in parallel
  can no longer exceed three per window; the right guess's
  attempt is handed back, and a code can be used once even by two
  simultaneous requests. Rules and messages unchanged.
- **SMS failures** (network error, timeout, HTTP error, provider refusal) all
  come back as 502 `SMS_SEND_FAILED` with a plain message; the provider's own
  words go to the logs and the team alert, not the customer.
- **`POST /auth/refresh`** is behind the global limiter only, not the strict
  10-a-minute auth one: it needs a valid cookie, and several open tabs
  refreshing at once could log a household out.
- **Telegram alerts link to the booking's own admin page**
  (`admin.detlio.com/bookings/<id>`) instead of the list. The pending digest,
  which lists many, still links to the list.
- **`AppError` can carry `retryAfterSeconds`**, sent as `Retry-After` and in
  the error body; the per-IP limiter uses it too.
- **Payment-failure messages** live in one table in the booking-intents
  service, shared by the confirm call and the new status read.

- **Minimum notice**: 1 hour at the garage, 3 doorstep, for the slot list
  (`booking_type` query param; `fitsInDay` and `minNoticeMins` in the
  response), checkout intents and reschedules (`SLOT_TOO_SOON`).
- **Cancel and reschedule cutoff** applies only once the garage has accepted; a
  pending booking can be cancelled or moved any time.
- **Reschedule** creates the new booking as pending: the garage accepts the new
  time.
- **Accept** is refused once the start time has passed (`BOOKING_START_PASSED`).
- **Status changes are conditional** on the status read: a simultaneous accept
  and cancel can no longer both succeed (`BOOKING_STATE_CHANGED`, 409).

## [0.3.0] — 2026-08-28

Geolocation, end to end.

### Added

- **PostGIS foundation** (migration `0019_add_geo`). The extension lives in a
  dedicated `gis` schema — PostGIS 2.3+ cannot be relocated afterwards, so this
  follows Supabase's own dashboard flow, which is the tested upgrade and restore
  path. `lat`/`lng` widen from `real` to `double precision` and stay the source
  of truth; a `geography(Point,4326)` column is **generated** from them, so every
  existing write path is untouched and the two can never drift.
- **GiST indexes**, including one partial index matching the public listing
  predicate (`status = 'active' AND is_verified`). `ORDER BY geo <-> $point` is
  then an index-ordered nearest-neighbour walk that stops at `LIMIT`, rather than
  a scan and sort — verified with `EXPLAIN` against a real PostGIS instance.
- **`GET /v1/vendors` sorts and pages in SQL**, with `lat`/`lng`, `radiusKm`,
  `bbox`, `sort` and an opaque `cursor`. Filtering and sorting used to happen in
  JS over the whole table, which cannot survive pagination: you cannot sort page
  two of a list the caller has only partly seen. `bbox` exists for the map view's
  "search this area" — a viewport is not a radius, and expressing one as the
  other is what forces an API rewrite later.
- **Auto-widening radius**, 10 → 25 → 50 km, reported back as `appliedRadiusKm`
  so the UI can say a search widened. Silently returning 25 km results for a
  10 km query makes a far garage look near.
- **`includeUnlocated`** (default on). Garages with no pin are appended *after*
  the located ones rather than mixed in — there is no honest way to rank a
  garage whose distance is unknown against one 800 m away. The two halves are
  read as separate queries, because a leading `ORDER BY (geo IS NULL)` defeats
  the KNN index scan entirely; the cursor therefore carries which half a page
  continues.
- **`GEO_REQUIRE_PIN`** (default off) gates whether a garage can be verified
  without coordinates. The end state is on — an unpinned garage cannot be found,
  sorted or coverage-checked — but a hard gate today would block every
  verification until the pre-map-picker backlog is revisited.
- **Doorstep coverage is enforced**, at listing time and again before a booking
  is priced. `vendor_service_areas` was written, read and documented as the rule
  but never actually consulted. Bounded by the garage's own
  `doorstep_radius_km`, since the question is "will you come to me" and only the
  garage can answer it.
- **Vendor-drawn coverage polygons** (`0020_add_service_area_polygons`). A radius
  is the wrong shape when a river, highway or city boundary cuts coverage. The
  polygon overrides the radius when present; the radius remains the default, so
  onboarding stays a one-number decision.
- **`src/lib/geo/` — a provider adapter.** Ola Maps is the first implementation
  (best data for Indian addresses), but nothing outside that directory names a
  provider. Adding Google, MapmyIndia or Geoapify is one file and one `case`.
- **`/v1/geo/{autocomplete,reverse,geocode,resolve,route}`** — a proxy, so the
  API key never reaches a browser, responses are cached in Postgres (`geo_cache`)
  to stay inside the free tier, and the endpoints are rate-limited. Reverse
  lookups key on coordinates rounded to ~11 m, collapsing everyone in one
  apartment block onto a single entry.
- **Driving time**, per garage and on demand only. Every other geo call is free
  (browser GPS) or paid once and cached forever (a garage geocoded at
  onboarding); routing is the only one whose volume tracks browsing, so it is
  never called for a list.
- **`GET /v1/admin/demand-supply`** — garages and doorstep bookings bucketed onto
  a ~1 km grid, so the cells with demand and no supply are visible. Plain
  coordinate rounding rather than H3: a `GROUP BY` already answers this, and the
  distortion is irrelevant at city scale.
- `geo_source` and `geo_confirmed_at` record where a coordinate came from and
  whether a human has confirmed it. No coordinate is ever guessed on a row's
  behalf — there is deliberately no geocoding backfill.

### Fixed

- **The placeholder purge in `0019` matched nothing.** It compared
  `lat = 13.0067::double precision` *after* widening `real` → `double precision`,
  but a float4 `13.0067` widened reads back as `13.006699562072754`. Every
  placeholder row would have survived and quietly poisoned distance sorting.
  Now matched with a 1e-5 tolerance, far above the ~4.4e-7 float artifact and far
  below any two genuinely distinct pins.
- **`<->` and `&&` did not resolve at runtime.** PostGIS is in `gis`, and an
  infix operator cannot take a schema prefix the way a function can — it needs
  `OPERATOR(gis.<->)`. Every distance-sorted listing and every map bbox query
  would have failed with *"operator does not exist"*.
- **`geo_confirmed_at` had exactly one writer — `verifyVendor` — which cannot
  run twice.** Every already-verified garage was therefore stuck reading as an
  unconfirmed pin with no path to change it. `PATCH /v1/admin/vendors/:id` now
  accepts `confirmLocation: true`, and stamps confirmation when an admin
  actually moves a pin. Moving is detected by comparing against the stored
  coordinates rather than by their presence in the payload: the admin form
  round-trips every field, so keying off presence would confirm a location on
  any save.
- **`POST /v1/bookings` accepted `addressId` and ignored it**, so doorstep
  bookings snapshotted no address at all. The address is now loaded, checked
  against the garage's coverage, and snapshotted onto the booking.
- **Ola rejected every server-side request with 403.** It authorises keys against
  a domain allowlist and reads the `Origin` header to decide — `Referer` is
  ignored — and a server sends neither, producing
  `{"message":"Domain  is not allowed."}` with an empty domain. `OLA_MAPS_ORIGIN`
  supplies one, and a 403 mentioning a domain now returns a message naming the
  actual fix instead of a generic upstream error.
- `X-Request-Id` was sent as a query parameter rather than a header, so Ola
  ignored it and every keystroke counted as a separate billable session.
- The `geo` columns are deliberately **not** declared in the Drizzle schema.
  Declaring them put them in the implicit `SELECT` list of every `findMany`, so
  the driver returned an EWKB hex blob that rode along in any response built by
  spreading a row — which is exactly what the admin endpoints do.

### Security

- **`/geo/maps-link` fetches a user-supplied URL, which is an SSRF surface.** It
  expands redirects by hand rather than with `redirect: 'follow'`, checking every
  hop against a Google host allowlist over HTTPS and capping at five hops — an
  open redirect on a Google domain would otherwise be a route into the network.
  This is the one thing about a pasted link that *is* validated; its shape is not.
- Address autocomplete and routing are the only endpoints whose call volume
  tracks browsing rather than saves, so they carry their own per-IP limit
  (`GEO_AUTOCOMPLETE_RATE_LIMIT`) on top of the global one. They are the two that
  could burn the provider's free tier through ordinary use.

## [0.2.0] — 2026-08-27

Discounts, end to end.

### Added

- **`discounts` and `discount_redemptions` tables**, plus `subtotal_amount`,
  `discount_amount`, `discount_id`, `discount_code` and `discount_funded_by` on
  `bookings` (migration `0016_add_discounts`). `bookings.amount` keeps its
  meaning — the amount actually charged — so payments, the Razorpay order and
  every existing reader are unaffected. The invariant is
  `amount = subtotal_amount - discount_amount`.
- Percentage or flat-amount effects, an optional cap on percentages, a minimum
  booking amount, per-customer and total usage limits, an active window, an
  on/off switch, and optional scoping to a single garage.
- **Per-code funding** — `platform` (Detlio absorbs it, the garage is paid the
  full pre-discount price) or `vendor` (the garage absorbs it). Snapshotted onto
  the booking, so editing a live code never rewrites a finished job's payout.
  `computeVendorPayout` is the one place that branch exists.
- `src/lib/discounts.ts` — money math and row-local rules, in integer paise.
  `resolveDiscount()` in the discounts module composes it with the usage counts
  and is the single entry point, shared by the preview endpoint and the booking
  write path, so a quoted discount can never disagree with the charged one.
- `POST /v1/discounts/validate` — customer-facing preview, rate limited. The
  subtotal is always recomputed from the service and the customer's vehicle; a
  client-sent price is never trusted.
- `/v1/admin/discounts` CRUD with usage counts, mounted under `/admin` because
  the admin session cookie is scoped to that path. Deleting a redeemed code
  returns 409 — deactivate instead.
- `POST /v1/bookings` accepts `discountCode`, re-resolves it, and writes the
  booking, its payment and the redemption in one transaction under an advisory
  lock on the discount. Rescheduling carries the discount to the new booking and
  moves the redemption rather than duplicating it.
- Every resolved total is floored at ₹1: Razorpay rejects a zero-value order, so
  an oversized flat code clamps rather than erroring, and percentages cap at 99.
- Version reporting at boot and on `GET /`, and this changelog.

### Fixed

- Migration `0017_tighten_discount_effect_constraints` narrows the effect check
  constraints so a row cannot carry the opposite effect's columns. `0016` only
  asserted that the *required* column was present, which let a partial `PATCH`
  write a `percent_off` onto a flat discount that the engine silently ignores.
- `updateDiscount` reconciles the effective discount type against the stored row
  before writing, so such a `PATCH` is now a 400 rather than a bad row.
- `assertVendorExists` is a single indexed lookup instead of listing every
  vendor, and no longer 404s when editing a discount whose garage was archived.
- `getDiscount` scopes its usage aggregate to one row instead of grouping the
  whole redemption table.
- `%` and `_` are escaped in the admin discount search, so they match as
  characters rather than as wildcards.

### Security

- **Usage limits count *held* redemptions, not just paid ones.** Counting only
  paid ones made per-customer limits bypassable: the redemption and its
  `pending` payment are written in the same transaction, so the check was false
  for every booking in flight — a customer could open several bookings on a
  once-per-customer code before paying for any, then pay for all of them.
  Cancelling or refunding releases the allowance. The two predicates now live in
  `discounts.predicates.ts` and are imported by both repositories rather than
  hand-copied.
- **Cash bookings count too.** `markCompleted` settles a cash booking to
  `collected`, never `paid`, so the old predicate made every legacy cash booking
  invisible to both the limits and admin reporting — and disagreed with the
  vendor-facing earnings math, which has always counted both.
- **`fundedBy` and `isActive` defaults moved off the shared base schema.** Zod 4
  applies `.default()` through `.partial()`, so every `PATCH` carried
  `fundedBy: 'platform'`: flipping a vendor-funded code off and on again
  silently converted it to platform-funded and paid the garage full price out of
  platform margin. The same bug made the update schema's "at least one field"
  check dead, since `{}` parsed to two keys.

## [0.1.0] — 2026-08-18

- Auth: phone OTP for customers and vendors, credentials for admins, with
  refresh tokens and role-gated middleware.
- Bookings with online prepayment via Razorpay, slot availability derived from
  vendor working hours, and a one-car-in-one-place guard against double booking.
- Rescheduling — at most twice, at least two hours ahead, carrying the payment
  to the new booking (2026-08-10).
- Vendors, services, packages, per-service images, per-vehicle pricing tiers and
  R2-backed media (2026-08-16, 2026-08-18).
- Unlimited vendor capacity and real ratings (2026-08-16).
- Admin API for vendor CRUD, verification, archiving and bookings.
- Fixed: the admin token no longer leaks into `/auth/me` and 500s (2026-08-09).
