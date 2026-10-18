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

- **Contact windows: customer and garage phone numbers only from 2 hours
  before the job until it's done** (owner decision, 18 Oct 2026; no
  migration). One pure rule, `lib/contact-window.ts` (`contactWindow`,
  unit-tested; numbers twinned in `packages/core/src/contact-window.ts` with a
  parity test): opens 2 hours before the slot (pickup & drop: the pickup
  slot); in progress, and a pickup car between Picked up and Delivered, is
  always inside; completed closes 1 hour after completion (Delivered for
  pickup); a booking nobody started closes 2 hours after its slot; cancelled,
  no-show or moved is closed at once.
  - The customer's booking payloads (`GET /bookings/:id`, `/bookings/me`,
    create, cancel, reschedule) send the garage's `vendor.phone` and
    `vendor.whatsapp` as null outside the window; the address, pin and maps
    link stay. The garage's (`toVendorBookingResponse`: `GET /bookings/vendor`,
    `GET /bookings/:id`, every job action) send the customer's `user.phone` as
    null outside it; the name stays, and so does a doorstep or pickup address.
    Both carry `contactWindow { opensAt, closesAt, open }`.
  - Admin is not windowed. The receipt never printed the garage's phone and
    still doesn't; push and Updates carry no phone numbers.
  - E2E fixtures: `VENDORS.contact`, `CUSTOMERS.contact`, `STAFF.contactOwner`
    and four bookings (ids 3400–3499, phones 90000034xx).
- **Gift a wash: Detlio gifts, Detlio credit, and paying for a booking
  with credit, behind `GIFTS_ENABLED` (default off)** (migration
  `0049_gift_credit`, additive, after 0048: new
  tables `gifts` (with `gift_number_seq`), `gift_credit_entries` and
  `gift_code_attempts`, `payments.credit_amount` / `credit_returned_at` and
  `booking_intents.credit_amount`, with CHECKs and partial unique indexes).
  - Off until the owner's lawyer/CA confirm the structure (prepaid payment
    instrument rules; questions as lawyer notes in
    `apps/users/lib/legal/gifts.ts`, never public copy). While off every
    gift and credit route but `GET /gifts/config` and `GET
    /admin/gifts/config` is a 404 and checkout ignores `useCredit`.
  - Buying (`modules/gifts`): `POST /users/me/gifts` (₹300–₹5,000, at most
    ₹10,000 a buyer a day under `gifts-buy:<buyer>`), Razorpay with
    `gift_id` notes, `POST /users/me/gifts/:id/verify` and the webhook
    (after `charge_id`) settle it once; a stray second payment alerts
    (`gift_payment_stray`). Evidence: the gift's `G-000123` reference,
    amount, date and Razorpay payment id (no DTL receipt number).
  - Links and codes: `POST /users/me/gifts/:id/link` makes a 16-character
    code (no look-alikes), shown once; only its SHA-256 is stored, and a new
    link ends the old one. `POST /gifts/lookup` (public) shows the card;
    `POST /users/me/gifts/redeem` turns it into credit once. Wrong codes are
    counted per customer and per hashed address (10 / 30 an hour, 429
    `GIFT_CODE_RATE_LIMIT`) plus a per-IP burst limiter
    (`GIFT_CODE_RATE_LIMIT`, default 20/min).
  - The ledger (`modules/gift-credit`, `lib/gift-credit.ts`): lots and
    draws, spent oldest expiry first under `gift-credit:<userId>`; 12 months
    from the gift's payment; `GET /users/me/credit`.
  - Checkout: `POST /booking-intents { useCredit }`, promo first, then
    credit, never leaving Razorpay under ₹1. Credit is drawn in
    `consumeIntent` under the customer's credit lock (lock order step 5a);
    if it is gone the checkout fails as `credit_exhausted` (Razorpay part
    refunded). Credit covering everything books at once with no Razorpay
    order (`paidWithCredit: true`). `payments.amount` stays the Razorpay
    part, so refunds only ever send back Razorpay money.
  - Refunds: the credit part of a cancelled booking goes back as credit
    (from `refundsService.queueAutoRefund`, whatever AUTO_REFUNDS says, and
    the pending-digest cron), once; the receipt, the booking's `refund`
    (`credit`), Updates and push say so. A customer no-show keeps it.
  - Garages are paid as for a card payment (payouts and commission read
    `bookings.amount`); Statistics' collected and the pilot numbers count
    the credit part until it goes back.
  - Admin (`/admin/gifts`, `/admin/gifts/credit`, super-admin): summary
    with outstanding liability, the gift list, Cancel gift, customer credit
    by phone, top balances, and Adjust credit; both actions write
    `admin_audit_log`.
  - The cron also returns missed credit, writes off expired credit and
    clears wrong-code rows. `DELETE /users/me` refuses an account with
    gifts or credit (409 `ACCOUNT_HAS_GIFTS`); the pilot reset keeps any
    chain paid with credit.

- **Detlio Certified garages: standards, quality checks, a seal and a
  filter** (migration `0048_detlio_certified`, additive: new tables
  `vendor_quality_checks` (IST date of the visit, `mystery_visit` /
  `inspection`, checker's name, `pass` / `fail`, notes required on a fail,
  who recorded it; CHECKs) and `vendor_certifications` (one row per garage:
  certified at/by, revoked at/by/reason/kind `revoked` | `lapsed`, the last
  evaluation's `eligible`, `eligibility` JSON snapshot and
  `last_evaluated_at`, `ineligible_since`, `eligible_alerted_at`; CHECKs);
  both cascade with the garage. Numbered 0048, after 0045–0047 from branches
  built in parallel; migrations run 0045 → 0048 in order).
  - Rules in `lib/certification.ts` (pure, unit-tested; thresholds in one
    object, `CERTIFICATION_RULES`, twinned with
    `packages/core/src/certification.ts` by a parity test). **Eligible**,
    over the last 90 IST days with Test-marked bookings left out: documents
    verified (0043); rating 4.5+ from 10+ reviews (all-time); 20+ completed
    bookings; 90%+ of paid bookings with a deadline (0042) answered in time
    (a miss is `response_missed_at` or an accept after `respond_by`;
    declines are answers; none yet passes); complaints in damage /
    service_quality / garage_no_show under 3% of completed (every status
    counts: complaints have no "upheld" flag); no garage no-shows; photo
    compliance 90%+ (0045's `lib/photo-compliance.ts` over its 90 days,
    the figure admin's garage card shows: `photoComplianceByGarage` in
    `modules/certification` reads the batch's jobs
    (`certificationRepository.photoComplianceJobs`) and
    `fromPhotoCompliance` turns the lib's whole percent into the rule's
    rate; no job to grade passes). **Certified** = eligible
    + the latest quality check of the last 6 months a pass + Certify
    pressed.
  - `modules/certification`: admin (super-admin) `GET
    /admin/certification/vendors/:id` (standards measured now, checks,
    why Certify is off), `POST …/checks`, `POST …/certify { actorName }`,
    `POST …/revoke { actorName, reason }` (409 `VENDOR_IN_BIN`,
    `ALREADY_CERTIFIED`, `CERTIFICATION_NOT_ELIGIBLE`,
    `CERTIFICATION_NO_PASSING_CHECK`, `NOT_CERTIFIED`; 400
    `CHECK_DATE_IN_FUTURE` / `CHECK_DATE_TOO_OLD`); audit rows
    `garage_certified`, `garage_certification_revoked`,
    `garage_certification_lapsed`. Garage (owner seat) `GET
    /vendors/me/certification`: its own figures, never a checker or notes.
    Every write under `pg_advisory_xact_lock('certification:<garage>')`.
  - Nightly on the pending-digest cron (`certificationService.sweep`): each
    garage on the app or certified, once per daily run from 05:00 IST, 20 a
    run; a certified garage short (or whose check ran out or failed) for 14
    IST days loses the seal on its own. Nothing runs while garage documents
    are off. The digest summary gains `certification`.
  - Telegram: `certification_eligible` (arrange a check),
    `certification_at_risk` (first night short, with the last day it keeps
    the seal), `certification_lost` (lapsed, or revoked by name with the
    reason quoted).
  - Customers: `certified: boolean` on `GET /vendors/:id` (public
    allow-list) and on every card (`vendorCardsFor`); `GET
    /vendors?certified=true` filters in SQL (`CERTIFIED_GARAGE`, twin
    `isCertified`, pinned by the predicates test), so it holds across sort
    and pages. `GET /admin/vendors` rows carry `certification` (from the
    last evaluation). A tombstone deletes its checks and certification.

- **"Notify me if a slot opens"** (migration `0047_slot_alerts`, additive:
  new table `slot_alerts` — customer, garage, IST date, `time_window`
  (`any`/`morning`/`afternoon`/`evening`, CHECK), booking type, the
  services' total `duration_mins`, `service_ids`, `expires_at` (end of the
  day), `notified_at`/`notified_slot_at` (both or neither, CHECK),
  `last_checked_at`; one waiting per customer, garage and date (partial
  unique index); cascades with the customer and the garage. Numbered after
  0045/0046, which come from parallel branches).
  - `modules/slot-alerts`: `GET`/`POST /users/me/slot-alerts`,
    `DELETE /users/me/slot-alerts/:id` (the session's customer only;
    anyone else's is 404 `SLOT_ALERT_NOT_FOUND`). At most 5 waiting
    (409 `SLOT_ALERT_LIMIT`, under a per-customer lock); setting one again
    for the same garage and day changes it. Refused when a time in the
    window is free now (409 `SLOT_ALERT_SLOT_FREE`), the day is closed or
    paused, the job is too long for it, or no time in the window has notice
    left (409 `SLOT_ALERT_NO_TIMES`); today up to 60 days ahead.
  - Matching runs the slot list's own rule: `slotsForDay` (new, in
    `lib/slots.ts`; `jobSlots` now runs it too, same answers) for the
    alert's job length and booking type, then its window.
  - Re-checked after every write that frees capacity commits (customer
    cancel, garage decline, admin cancel, no-show, not accepted in time,
    suggested times declined or expired, a booking moved, a holiday
    removed, a pause lifted, hours, slot length or admin's garage save),
    in the background; the pending-digest cron sweeps 20 garage-days a run
    as a safety net and deletes alerts whose day ended 31+ days ago. The
    digest's summary gains `slotAlerts`.
  - A match is claimed once, then pushed (`customerSlotOpened`, Booking
    updates switch) and shown in Updates (`slot_opened`): "A slot opened at
    <garage>", "Sat 24 Oct — 10:30 AM. Book before it goes.", opening
    checkout on that day with the same services and mode. Nothing is held.

- **Car history and coating/detailing reminders** (migration
  `0046_vehicle_service_reminders`, additive: new table
  `vehicle_service_reminders` (user, car, kind, due date, source booking,
  status open/dismissed/done/superseded, snooze date, notified date, the
  booking that answered it; unique per job and kind; CHECKs; cascades with
  the user, the car and the source booking). Numbered 0046 because 0045
  belongs to the job photo standards branch, built in parallel; the
  migrations lint reports the gap until 0045 is merged).
  - `modules/car-history`: `GET /users/me/vehicles/:vehicleId/history
    [?category=]` (the customer's own current car only, else 404): completed
    jobs newest first, one per reschedule chain, with garage, services, amount
    paid (payment and paid bills/extra work, less refunds), receipt and photo
    counts; washes and spend this year and all time; the categories present;
    how many cancelled bookings were left out; the nearest reminder. Rules in
    `lib/car-history.ts` (pure, unit-tested).
  - Reminders (`lib/service-reminders.ts`, pure, unit-tested): a completed
    coating schedules a maintenance wash at 3 months and a coating check at
    12; a detailing a repeat at 6. A newer job of the same kind supersedes;
    a booking of an answering service for the car (from 30 days before the
    due date) makes it booked, then done. `POST /users/me/service-reminders/
    :id/dismiss` and `/snooze` (14 days; 409 `REMINDER_CLOSED`). Scheduled
    after Mark completed, Delivered and admin's pickup override, with a
    catch-up in the pending-digest cron.
  - Home's soft card `service_reminder` (only when no must-act card, Rate
    your wash or resolved complaint wants the place) and an Updates row on
    the due date; a browser notification in the 09:00 IST cron runs of the
    due date, claimed by `notified_on` so it goes once per date, to
    customers with Reminders on. Never names the car. The digest's summary
    gains `serviceReminders`.
  - E2E fixtures in the 2600–2699 / 90000026xx range (`seedCarHistoryRows`).

- **Job photo standards: required before/after photos for garages, optional
  condition photos for customers** (migration `0045_job_photo_standards`,
  additive: `job_photos.uploaded_by_role` (text + CHECK `garage` /
  `customer`, default `garage`, so every existing row stays the garage's),
  `job_photos.angle` (text + CHECK, nullable), an index on (booking, role,
  stage), and `bookings.photos_waived_at` / `photos_waived_by` /
  `photos_waived_reason` (all or none, CHECK)).
  - Rules in `lib/job-photo-standards.ts` (pure, unit-tested; twinned with
    `packages/core/src/job-photo-standards.ts`, parity test). Start needs 2
    before photos of the garage's; Complete, and pickup & drop's Out for
    delivery and Delivered, 2 after photos: 409 `JOB_PHOTOS_REQUIRED`, also
    held in each conditional write. A passed gate's photos cannot drop below
    2 (409 `JOB_PHOTO_MINIMUM`). `JOB_PHOTOS_REQUIRED` is **off unless
    `on`** (pilot: nudged, not blocked); `JOB_PHOTOS_REQUIRED_GARAGES` turns it on for named garages.
  - Tightened garage windows (`lib/job-records.ts`): before photos until
    completion, after photos until 1 hour after it (no late fabrication);
    the 7-day outer freeze stays. Each side removes only its own photos.
  - Customers: `POST /bookings/:id/photos/upload-url`, `POST
    /bookings/:id/photos { stage, key, angle? }`, `DELETE
    /bookings/:id/photos/:photoId` (own booking only, else 404): up to 4
    before photos until the work starts (pickup: until collected), 4 after
    photos for 24 hours after completion, into their own `customer/` folder.
    The booking payload gains `conditionPhotos`; customers see their own
    photos always and the garage's once in progress. Garages see both sides (the customer's once they have accepted the job)
    and get `photoStandard`. Photo views carry `angle` and `by`.
  - Admin: `POST /admin/bookings/:id/photos-waiver { actorName, reason }`;
    the booking detail adds each photo's `uploadedByName`, `photoStandard`
    and `photosWaiver`; `GET /admin/vendors` adds `photoCompliance` (90
    days, `lib/photo-compliance.ts`, pure, reusable).
  - Push: "Your car's before photos are in" when the work starts with the
    garage's before photos; the completion message becomes "Your car is
    done — see the after photos" when it has after photos. Home's Before &
    after tile and Updates' photos row count the garage's photos only.

- **Free browser notifications for garages and customers, booking
  reminders, and a Telegram test button** (migration
  `0044_push_notifications`, additive: new tables `push_subscriptions`
  (endpoint unique, keys, user, audience `customer`/`garage`, garage for a
  seat's, device label, last success, failures in a row; CHECKs; cascades
  with the user and the garage) and `notification_sends` (booking, kind
  unique; cascades with the booking), and `users.push_booking_updates` /
  `users.push_reminders`, both default true).
  - Web Push with VAPID through the `web-push` package (3.6.7, pinned; only
    `lib/web-push.ts` imports it). Off until `VAPID_PUBLIC_KEY`,
    `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are set (docs/push-
    notifications.md): every push route but `/config` is a 404 and nothing
    is read or sent. `PUSH_FAKE=1` (E2E only, refused in production)
    records instead of sending.
  - `modules/push`: customers at `/users/me/push` (`GET /config`,
    `POST /subscriptions`, `POST /unsubscribe`, `POST /status`,
    `PATCH /preferences`, `POST /test`), garage seats at
    `/vendors/me/push` (owners and operators; the garage from
    resolveTenant; a support session is 403 `PUSH_SUPPORT_SESSION`).
    Endpoints only for known push services (FCM, Mozilla, Apple, Windows),
    always in the body. Test sends rate limited (5 per 10 minutes).
  - One `pushService.notify(recipient, message)` after the response
    (`runInBackground`), never failing the request; 404/410 deletes the
    subscription, 10 failures in a row too; logs carry status codes, never
    endpoints. Words in `lib/push-messages.ts` (booking basics only; tested
    for no personal data), Updates' wording where it exists.
  - Garages: new paid booking (with "accept within N min"), "accept within
    10 min" before `respond_by` (AUTO_CANCEL_UNANSWERED only), suggested
    time picked / none worked, extra work paid / declined, customer
    cancelled / moved it, not accepted in time. Customers: accepted,
    declined, other times suggested, extra work asked for, car collected /
    on its way back, job done ("Rate your wash"), refund started or
    recorded, complaint acknowledged / resolved, not accepted in time.
  - Reminders on the pending-digest cron (`lib/push-reminders.ts`): the
    evening before in the 18:00 IST runs, and 60–70 minutes before (down to
    30 if a run is missed), confirmed bookings only, each claimed in
    `notification_sends` before sending; 50 of each kind a run, 10-second
    budget. The digest's summary gains `notifications`.
  - Admin → Alerts (`modules/alerts`, super-admin): `GET
    /admin/alerts/telegram` (`configured`, `liveHere`; never the token or
    chat id) and `POST /admin/alerts/telegram/test { actorName }`, which
    posts "✅ Detlio test alert from <name>" regardless of the
    Production-only gate (409 `TELEGRAM_NOT_CONFIGURED`, 502
    `TELEGRAM_SEND_FAILED` with Telegram's own words), rate limited per
    admin per hour (`TELEGRAM_TEST_RATE_LIMIT`, default 5).

- **Garage documents: private uploads, admin review and a "Documents
  verified" badge** (migration `0043_garage_documents`, additive: new tables
  `vendor_documents` (one per garage per type; type, status, version,
  expiry, uploader, reviewer, rejection reason; CHECKs) and
  `vendor_document_files` (front/back, storage key, type, size). Numbered
  0043 because 0042 belongs to the garage response deadline, built in
  parallel; the migrations lint reports the gap until 0042 is merged).
  - `modules/vendor-documents`, rules in `lib/vendor-documents.ts` (pure,
    unit-tested; twinned with `packages/core/src/vendor-documents.ts`).
    Required: shop photo, owner ID (PAN, or Aadhaar with the first 8 digits
    covered), bank proof, the signed Detlio agreement; optional: GST
    certificate, trade licence (with an optional expiry). Separate from
    `is_verified`, which still alone decides listing.
  - **Private bucket** `R2_DOCS_BUCKET` (`lib/document-storage.ts`; setup in
    `docs/garage-documents.md`): presigned PUT signed for the exact size
    (≤ 10 MB, JPEG/PNG/WebP/PDF), each upload checked with HeadObject before
    it is recorded, files viewed only through 5-minute presigned GETs made
    per press, never stored or logged. Unset = off: every documents route
    but `/config` is a 404 and no garage has the badge.
  - Garage (owner seat only, `/vendors/me/documents`): `GET /config`,
    `GET /`, `POST /upload-url`, `POST /` (submit or replace; back to
    pending, old files deleted), `GET /:documentId/files/:fileId/link`.
    Admin (super-admin, `/admin/documents`): `GET /config`,
    `GET /vendors/:vendorId`, `POST /vendors/:vendorId/upload-url`,
    `POST /vendors/:vendorId` (on the garage's behalf, `approve` optional),
    `POST /vendors/:vendorId/:documentId/review { action, version,
    actorName, reason? }` (409 `DOCUMENT_CHANGED`,
    `DOCUMENT_ALREADY_APPROVED` / `_REJECTED`; `VENDOR_IN_BIN`),
    `GET /vendors/:vendorId/:documentId/files/:fileId/link`.
  - `documentsVerified` (boolean only) on `GET /vendors/:id` (public
    allow-list) and every garage card (`vendorCardsFor`, so Saved garages
    too). `GET /admin/vendors` gains `documents` (summary) and the optional
    readiness item "Documents not verified" (`tab: 'documents'`).
  - Telegram `documents_uploaded`. Delete forever removes the documents and
    their files (a tombstone keeps only the signed agreement); the Bin and
    the pilot reset keep them. E2E: MinIO's private `detlio-e2e-docs`.

- **Garages accept within 30 minutes of their opening hours, or the booking
  is cancelled with a full refund** (migration `0042_garage_response_deadline`,
  additive: `bookings.respond_by` and `bookings.response_missed_at`, both
  nullable, a CHECK keeping `response_missed_at` to a garage-side
  cancellation with a deadline, two partial indexes; nothing backfilled).
  Behind `AUTO_CANCEL_UNANSWERED` (default **off**); the window is
  `GARAGE_RESPONSE_MINUTES` (default 30).
  - **The deadline** (`lib/response-deadline.ts`, pure and unit-tested):
    paid while open, payment + 30 opening-hours minutes (the clock stops at
    closing and runs on at the next opening); paid while shut (outside that
    IST day's hours, a holiday, paused), 30 minutes after it next opens;
    never later than 1 hour before the slot, with a 15-minute floor from
    payment, never past the slot's start. Written with the payment
    (`consumeIntent`, `settlePayment`) and by a customer's reschedule back to
    pending (fresh from the move), via `respondByFor` in the same
    transaction. Withdrawing suggested times leaves at least 15 minutes.
  - **Enforced while the switch is on**: the garage's Accept and Suggest
    times after it are 409 `RESPONSE_TIME_PASSED`, in their conditional
    writes too, and always once the cron has cancelled the booking. The
    pending-digest cron cancels overdue paid pending bookings with no open
    suggestion (20 a run, oldest first, quiet hours included) through one
    conditional write, `cancelNotAcceptedInTime`: `cancelled_by = 'vendor'`
    (a full refund owed, `garage_declined` for AUTO_REFUNDS, counted with
    garage declines), `response_missed_at`, reason "Not accepted in time".
    An Accept racing it leaves exactly one winner.
  - `GET /bookings/:id/other-garages` (`modules/garage-response`): up to
    three nearby live garages for the same booking type and at least one of
    the booked services' categories, from the customer's address (doorstep,
    pickup) or the garage's pin (drop-in), as the garage list's cards
    (`vendorCardsFor`); `listPublicVendorPage` gains `anyCategory` and
    `excludeIds`.
  - Booking payloads carry `responseDeadline { respondBy, enforced,
    windowMins }` and `notAcceptedInTime`; admin rows `respondBy` and
    `notAcceptedInTime`; the refunds list says "Not accepted in time";
    Updates says "<Garage> didn't accept in time" with the refund (no Home
    card: nothing is left for the customer to do). Statistics' garage rows
    gain `notAcceptedInTime`.
  - Telegram: `not_accepted_in_time` per auto-cancel; the 30-minute nudge
    names the deadline; the 07:00 roll-up counts yesterday's auto-cancels per
    garage. The digest's answer gains `notAccepted` and
    `missedResponsesYesterday`.
  - E2E: `response-deadline-journey.spec.ts` (@p0) on fixtures in the
    2200–2299 range; `.env.e2e` turns the switch on.

- **Garages suggest other times, and ask for extra work the customer
  approves by paying in the app** (migration
  `0041_time_proposals_and_extra_work`, additive: `booking_charge_kind`
  gains `extra_work`; `booking_charges.photos` (jsonb, default `[]`, at most
  three, extra work only), `cancelled_at` and `cancel_reason` (text + CHECK:
  `replaced` / `withdrawn` / `declined` / `booking_closed`); new table
  `booking_time_proposals` (one open per booking, partial unique index);
  `booking_reschedules.proposal_id`).
  - **Suggest another time** (`modules/time-proposals`, rules in
    `lib/time-proposals.ts`, pure and unit-tested). On a pending, paid
    booking: `GET /vendors/me/bookings/:id/time-proposal/slots?date=` is the
    garage's own free times for that job (the slot list's rule, now
    `jobSlots` in vendors.service, shared with the customer's picker; the
    booking itself left out, never its own time, never one leaving under 30
    minutes to answer); `POST …/time-proposal { slots: 1–3, note? }`
    (each re-checked against the list; 409 `TIME_PROPOSAL_OPEN`,
    `TIME_PROPOSAL_SLOT_GONE`; 400 `TIME_PROPOSAL_TOO_SOON` /
    `TIME_PROPOSAL_INVALID`); `POST …/time-proposal/withdraw`. Operators
    too, like Accept. While one is open the garage's Accept and Decline are
    409 `TIME_PROPOSAL_OPEN` (also in their conditional writes).
    Customer: `POST /bookings/:id/time-proposal/choose { slot }` moves the
    booking through the reschedule write (new row in the chain, old one
    retired as moved, payment, receipt chain and pickup codes carried) and
    writes it **confirmed**, accepted by whoever suggested it; the
    suggestion's row is locked after the booking's own and must still be
    open with that time (409 `TIME_PROPOSAL_CLOSED`); capacity is re-checked
    under the vendor-day lock (409 `TIME_PROPOSAL_SLOT_GONE`, "That time was
    just taken"). It does not count toward the customer's two reschedules
    (the cap counts `proposal_id IS NULL`; `reschedule_count` stays the
    customer's own moves). `POST /bookings/:id/time-proposal/decline`
    cancels it as the garage's decline (`cancelled_by = 'vendor'`): the
    payment is owed back in full and AUTO_REFUNDS treats it as
    `garage_declined`. **Expiry**: at the earliest option less its booking
    type's notice, or 12 hours, whichever is sooner; the pending-digest
    cron's sweep (first, 20 a run) cancels it the same way, and closes
    suggestions a booking left behind. Telegram: `time_proposal_made`,
    `time_proposal_outcome` (chosen / declined / expired).
  - **Extra work** (`booking_charges` kind `extra_work`, rules in
    `lib/extra-work.ts`, pure and unit-tested). On a confirmed or
    in-progress booking without an `on_inspection` service (400
    `EXTRA_WORK_ON_INSPECTION`: the final bill covers it):
    `POST /vendors/me/bookings/:id/extra-work/upload-url` (into the job's
    photo folder, as job photos), `POST …/extra-work { description, amount,
    note?, photoKeys ≤ 3 }` (at most 3 waiting, 409
    `EXTRA_WORK_LIMIT_REACHED`; written under the booking's row lock),
    `POST …/extra-work/:chargeId/withdraw` (unpaid only, 409
    `EXTRA_WORK_PAID`). The customer pays it with the final bill's own
    `pay` / `verify` (one order per charge; settlement conditional on
    `due` and the charge's order; `gateway_mode` recorded) — paying is the
    approval — or `POST /bookings/:id/charges/:chargeId/decline`. Mark
    completed and Delivered are refused while one waits (409
    `EXTRA_WORK_AWAITING`, also in the conditional write). Cancelling or
    moving a booking (customer, garage, Detlio) withdraws its unpaid extra
    work (`booking_closed`) and closes an open suggestion in the same
    transaction. Telegram: `extra_work_paid`, `extra_work_declined`; a
    payment landing on a closed request is `final_bill_refund_due` with
    `what: 'extra_work'`.
  - **Money**: paid extra work is kept only when the booking completes;
    on any other end (cancelled by anyone, moved, a no-show on either side)
    it is owed back (`lib/refunds.ts isBillRefundable`; the refunds SQL
    widened to match). Receipts list it (`extraWork`, refund lines
    `against: 'extra_work'`, in `totalPaid`). Commission charges it at the
    booking's main service rate and payouts include it, as a paid final
    bill (`billsPaid` is every paid charge); Statistics "collected"
    includes it. Refund items carry `chargeKind`.
  - **Home and Updates**: must-act cards `time_proposal` (first) and
    `extra_work_due` (then), before a bill and a closed day; still one card
    at most. Updates rows `time_proposal`, `extra_work_due`,
    `extra_work_paid`, `extra_work_declined`, `extra_work_withdrawn`; a
    booking cancelled because no time was picked says so.
  - Booking payloads carry `extraWork` and `timeProposal`; the garage's
    also `canSuggestTimes`, `extraWorkRefusal` and
    `completeBlockedByExtraWork`. Admin booking detail adds `extraWork`
    and `timeProposals`; its Bill due flag counts extra work due.

- **Complaints part 2: logged complaints, and answers in Updates**
  (migration `0039_logged_complaints_and_favourites`, additive:
  `complaints.source` (text + CHECK, existing rows `app`),
  `complaints.received_at` (existing rows get their `created_at`) and
  `complaints.logged_by`, with CHECKs tying `logged_by` to the source and
  `received_at` to no later than `created_at`).
  - `POST /admin/complaints { phone, customerName?, source, category,
    message, bookingRef?, receivedAt?, loggedBy }` (super-admin, `.strict()`)
    logs a complaint that came by phone, WhatsApp, email, in person or
    otherwise. It gets a normal C-number. The phone (any way of writing ten
    digits) finds the account and links the complaint to it, under the
    account's name, so it shows in the customer's My complaints; with no
    account the typed name is required (400 `COMPLAINT_NAME_REQUIRED`) and
    kept with the phone. A booking reference attaches the booking and its
    garage; with an account it must be theirs (409
    `COMPLAINT_BOOKING_NOT_THEIRS`), an unknown one is 404, two bookings
    nobody can tell apart 409 `COMPLAINT_BOOKING_AMBIGUOUS`. Rules in
    `modules/complaints/complaints.logging.ts` (pure, unit-tested). No
    per-customer limits for the team.
    `GET /admin/complaints/lookup?phone=&bookingRef=` answers the form's
    look-ups (the account's name, the booking) and writes nothing.
  - **The clock runs from `received_at`**: now, or up to 7 days back for a
    logged one (400 `COMPLAINT_RECEIVED_AT_INVALID` beyond, or in the
    future past a 5-minute fast clock; `resolveReceivedAt`). The due times,
    Overdue and the admin list's order all read it; `created_at` stays the
    moment the row was written (the per-hour limit and the reset's cutoff
    read that). Admin payloads gain `source`, `loggedBy`, `receivedAt`;
    customer payloads `source` and `receivedAt`. A logged complaint with no
    account is not "account deleted".
  - Telegram's `complaint_received` says "By phone, logged by Ravi." for a
    logged one.
  - **Updates**: a customer's complaint adds a row when the team
    acknowledges it ("We're looking into complaint C-000123"), resolves it
    ("Complaint C-000123 resolved — see our answer") or closes it, each
    opening `/profile#my-complaints`. Resolving or closing an open one is one
    row, not two. **Home**: a complaint resolved in the last 7 days, still
    unread in Updates, is a soft card (`complaint_resolved`) only when the
    soft card's place is free (no must-act card, no Rate your wash), so Home
    keeps at most two cards above the car; otherwise it is in Updates alone
    (`softCardWithComplaint`, `lib/home-cards.ts`).
- **Favourite garages** (same migration: `user_favourite_vendors`, PK
  `(user_id, vendor_id)`, both FKs `ON DELETE CASCADE`).
  `GET /users/me/favourites` (the garage list's own cards, newest saved
  first, only garages whose page customers can open: not in the Bin,
  suspended, archived or unverified; `pausedVendorIds` names paused ones;
  `max` 50), `PUT` and `DELETE /users/me/favourites/:vendorId` (both
  idempotent; 404 for a garage customers cannot open; 409
  `FAVOURITES_LIMIT` past 50, counted under a per-customer advisory lock
  taken on its own). The list's cards are built by `vendorCardsFor`, shared
  with `GET /vendors`, whose shape is unchanged. `DELETE /users/me` and
  Delete forever take the rows by cascade; a garage kept as a tombstone
  loses them in the same transaction; the pilot reset leaves them alone
  (not test data).

- **First-party usage events and the booking funnel** (migration
  `0040_analytics_events`, additive: `analytics_events`; no data step;
  `0039` is another branch's and is slotted in before it). No third party,
  no cookies, no personal data or free text in an event.
  - `POST /api/v1/events` (`modules/analytics`): a batch of at most 25
    events from the customer app, as `text/plain` (navigator.sendBeacon),
    16 KB at most (413 `EVENTS_TOO_LARGE`), strict zod against the
    allow-list in `lib/analytics.ts` (an unknown event, key or value shape
    is 400 `INVALID_EVENTS`; the API's own events cannot be sent), 204
    otherwise. No auth needed: the customer is read from the access cookie
    when signed in. Per-IP limit `ANALYTICS_RATE_LIMIT` (default 60 a
    minute) and 20 a minute per visit; left out of the global limiter so it
    never uses a customer's allowance. Crawlers and headless browsers are
    dropped (`ANALYTICS_ALLOW_HEADLESS=1` lets Playwright through; refused
    in production). Insert errors are logged and still answer 204.
  - Each row: event name (CHECK), random visit id from the tab's
    sessionStorage, the customer's id only when signed in (ON DELETE SET
    NULL, so `DELETE /users/me` leaves events anonymous), allow-listed
    props (`vendorId`, `mode`, `category`, `serviceCount`, `amountBucket`,
    `source`, `step`, `queryLength`, `cancelledBy`; CHECK), the path
    without its query string or ids, a device class from the window width,
    the app version.
  - `booking_paid` (from `consumeIntent`'s winner and `markBookingPaid`) and
    `booking_cancelled` (customer cancel, garage decline, admin cancel incl.
    the Bin) are recorded by the API after the response, never failing the
    payment or the cancel, with no user id; test-key and E2E payments, and
    cancelled bookings never paid for, are not recorded.
  - Kept 180 days: `POST /ops/pending-digest` deletes up to 5,000 older
    rows a run (id subquery with LIMIT on the `occurred_at` index; its
    answer gains `analyticsPurged`).
  - `GET /admin/stats/funnel?from&to&mode` (super-admin): visits → saw a
    garage → started checkout → picked a slot → pressed Pay → paid, each
    step's conversion and the biggest drop; categories browsed; the ten
    garages most viewed with their bookings and view-to-booking rate;
    devices; returning customers (of those who paid in the period, who
    booked again within 30 / 60 days; from bookings, Test-marked left out)
    and new against repeat bookings per week; `eventsSince`, the first
    event's day. Rules in `lib/analytics.ts` (pure, unit-tested), twinned
    with `packages/core/src/analytics-events.ts` (parity test).
  - Start pilot clean: a cutoff run lists the usage events recorded before
    the cutoff as one row with one tick (`only.analytics`), counted
    (`counts.analyticsEvents`, "N usage events"), deleted with the run, and
    not part of the fingerprint.

- `GET /bookings/:id` (and the customer's list) carries the garage's own
  `mapsUrl` on `vendor`, beside its phone, WhatsApp, address and pin, for the
  booking page's Directions when the garage has no pin.

- **Garage earnings and payouts** (migration `0038_garage_payouts`,
  additive: `vendor_payouts`, `vendor_payout_items` and
  `vendor_payout_accounts`; no data step). Customers pay Detlio; Detlio pays
  each garage its share by bank or UPI within 24 hours of the job, and now
  records it.
  - Earnings rules in `lib/payouts.ts` (pure, unit-tested), on top of
    `lib/commission.ts` (the same rates, free 25 and queue as Statistics):
    per booking chain the price (plus paid final bills), Detlio's promo
    (Detlio's cost), the garage's promo (off its share), commission (or its
    place in the free 25), refunds (standing ones only; a refund comes off
    the garage's figure in proportion to its part of what the customer
    paid, and the commission with it), the garage's share, cash the garage
    collected itself (old cash bookings: the garage owes Detlio the
    commission, netted off), and when it became payable (completed, or the
    no-show recorded; a later final bill moves it). Test-marked chains earn
    nothing.
  - A booking's balance is what it earns now less what payouts paid on it,
    so nothing is paid twice and a refund after a payout is owed back. Each
    payout keeps the figures it paid per booking, so statements never
    change.
  - `GET /vendors/me/earnings/statement?from&to` (vendor_admin only, the
    tenant's own garage): due now, paid this month, free bookings used, each
    booking in the range with commission, refunds, share, status and payout
    references, and the payouts in the range. `GET /vendors/me/earnings`
    is unchanged.
  - Admin (`modules/payouts`, super-admin, `/admin/payouts`): `GET /` (every
    garage's balance, oldest unpaid, past 24 hours, last payout, payout
    details masked), `GET /vendors/:id` (balance, what Record payout would
    pay, the bookings due, history with each payout's bookings, details in
    full), `POST /vendors/:id { amount, upTo, method, reference, paidAt,
    note?, actorName }` (settles every booking payable by `upTo`, only if it
    still comes to `amount`: 409 `PAYOUT_STATE_CHANGED`,
    `PAYOUT_NOTHING_DUE`, `PAYOUT_OWED_BACK`, `PAYOUT_REFERENCE_USED`; under
    `pg_advisory_xact_lock('payouts:<garage>')`), and
    `GET`/`PUT`/`DELETE /vendors/:id/account` (bank account and/or UPI id;
    409 `VENDOR_IN_BIN` for a garage in the Bin).
  - Telegram: the 7 am roll-up of `POST /ops/pending-digest` adds "💰
    Payouts due: N garages, ₹X total, oldest …", and posts for it alone;
    its answer gains `payoutsDue`.
  - Start pilot clean and Delete forever: a payout goes only with every
    booking it paid (and, in a cutoff run, only if recorded before the
    cutoff); otherwise its bookings are kept, "Paid out to the garage —
    kept". Counts gain `payouts`. A tombstone loses its payout details.
  - Statistics: refunds Razorpay failed no longer come off "collected after
    refunds" (0036's rule, missed when the two branches met).
  - E2E fixtures: `VENDORS.payouts`, `STAFF.payoutsOwner`,
    `CUSTOMERS.payouts`, `SERVICES.payoutsWash`, `BOOKINGS.payout*`. The
    Statistics fixtures from #46 were renumbered so no id or phone is
    shared: `CUSTOMERS.stats` is `id(158)`, phone `9000000058`, car
    `id(767)`; `VENDORS.stats` is `id(345)` (phone `9000004500`);
    `SERVICES.stats*` are `id(436–438)`.
- `GET /bookings/:id` (and the customer's list) carries the garage's own
  `mapsUrl` on `vendor`, beside its phone, WhatsApp, address and pin, for the
  booking page's Directions when the garage has no pin.


- **Refunds through Razorpay from the app** (migration
  `0036_razorpay_refunds`: four columns on `refund_records`, its
  one-per-starting-total index made partial, a new `auto_refund_cap_days`
  table; additive, no data step).
  - `POST /admin/refunds/send { kind, id, amount?, expectedRefunded?, note? }`
    (super-admin, `.strict()`): Refund now. Sends the refund through Razorpay
    (`POST /v1/payments/:id/refund`, speed `normal` only, notes naming our
    booking/checkout/bill, `X-Refund-Idempotency`) and records it exactly
    like Mark refunded, with the Razorpay refund id, the admin's name and
    "Sent through Razorpay from the app by …". Everything owed by default, a
    part on request, never more.
  - Never twice: every send first reads the payment's refunds from Razorpay
    (`GET /v1/payments/:id/refunds`) and records any it has no record of (a
    refund done in the dashboard is recorded, not repeated), then sends only
    what is still owed. Serialised per payment by
    `pg_advisory_xact_lock('refund:<payment>')`, held across the Razorpay
    calls and taken by Mark refunded and the refund webhooks too. Refusals:
    409 `REFUND_BUSY`, `REFUND_STATE_CHANGED`, `REFUND_RAZORPAY_MISMATCH`,
    `ALREADY_REFUNDED`; 400 `REFUND_TOO_MUCH`, `REFUND_NO_PAYMENT`; 502
    `RAZORPAY_REFUND_FAILED`; 503 `RAZORPAY_UNAVAILABLE`,
    `RAZORPAY_REFUND_UNKNOWN`.
  - `refund.processed` and `refund.failed` on the existing signed webhook,
    handled before any payment logic. A failed refund keeps its record
    (`gateway_status = 'failed'`, with why), comes off the money row's total
    (a fully refunded payment goes back to `paid`), notes the booking and
    alerts the team: the money shows as owed again. Failed rows are left out
    of the receipt, Home and Updates.
  - Automatic refunds behind `AUTO_REFUNDS=on` (default off: then nothing
    runs and nothing is read). The clear-cut cases (garage declined or
    no-show, customer cancelled in time, Detlio cancelled, checkout paid
    with no booking) are refunded right after the cancel commits
    (`waitUntil`), and `POST /ops/pending-digest` retries what was missed or
    failed (20 a run; its answer gains `autoRefunds`). Never final-bill
    money, never part amounts, never a booking with an open or acknowledged
    complaint, only money owed in the last 3 days, at most 3 failed tries.
    `AUTO_REFUND_DAILY_CAP_INR` (default 20000) stops them for the IST day,
    with one alert.
  - Telegram: `refund_sent` ("💸 Refund ₹X started for booking #… · auto"
    or "· admin"), `refund_failed`, `auto_refund_cap_reached`.
  - The customer's booking payload gains `refund.started { amount, at }`
    while a refund the app sent is pending at Razorpay (left out otherwise).
  - `E2E_FAKE_PAYMENTS` mints `rfnd_e2e_…` refunds in memory.

- **Pickup & drop, part 2 of 2: what the customer app reads** (no
  migration).
  - Home and Updates read the handover times of a customer's pickup
    bookings (never the codes). Updates gains `picked_up`, `at_garage` and
    `out_for_delivery` rows, and a delivered pickup job's completed row reads
    "Your car is back". Home's `next_booking` tile carries `pickupStage`
    (`booked` / `picked_up` / `at_garage` / `in_progress` /
    `out_for_delivery` / `delivered`, null on other types) from
    `customerPickupStage` in `lib/pickup.ts`, twinned in packages/core
    (parity test).
  - `GET /vendors?bookingType=pickup` no longer appends garages without a
    pin (they can't be booked for pickup: the reach is measured from the
    pin) and no longer runs the drop-in radius ladder, which pickup ignores.

- **Pickup & drop, part 1 of 2: garages, bookings and job steps** (migration
  `0037_pickup_drop`, additive: `booking_type` gains `'pickup'`; on
  `vendors`, `pickup_terms_accepted_at` / `_by`; on `bookings`,
  `picked_up_at`, `at_garage_at`, `out_for_delivery_at`, `delivered_at`,
  `pickup_code`, `delivery_code`, `pickup_code_attempts`,
  `delivery_code_attempts`, `pickup_override_by`, `delivery_override_by`,
  and two CHECKs keeping them to pickup bookings and the codes to 4 digits;
  no data step). Owner decisions, 17 Oct 2026: the garage collects the car
  from the customer's address, does the work at the garage and brings it
  back; only garages that turn it on, within their own pickup radius; 3
  hours' notice, as doorstep; the garage is responsible for the car from
  pickup until it is returned and must accept that when it turns pickup on;
  no pickup fee for now. The customer's booking screens are part 2.
  - The rules are `lib/pickup.ts` (pure, unit-tested; core twin
    `packages/core/src/pickup.ts`, parity test). **On** is `vendors.pickup`
    `'yes'` (a legacy `'nearby'` counts) **and** the terms on file
    (`isPickupOffered`, SQL twin `PICKUP_OFFERED` in
    `vendors.predicates.ts`, pinned by its test). A `'yes'` from onboarding
    before today has no terms, so it is not on until accepted. Labels and
    every rule keyed on the type are `lib/booking-types.ts`.
  - Turning it on: the garage's own tick in `PATCH /vendors/me/job-types
    { pickupEnabled, pickupRadiusKm, pickupTermsAccepted }` (owner/admin
    seat; a Detlio support session is refused, 403
    `PICKUP_TERMS_GARAGE_ONLY`), or admin's "the garage has agreed to this
    (signed agreement)" on `POST/PATCH /admin/vendors`
    (`pickupEnabled`, `pickupAgreementSigned`, `pickupRadiusKm`; the legacy
    `pickup` answer is read under the same rule, and only when it differs
    from what is stored). Without the tick: 400 `PICKUP_TERMS_REQUIRED`.
    The tick is taken afresh every time it is turned on, recorded with who
    (the member's name, or `admin: <name>`) and when. Off never needs it.
    `pickup` and `pickupRadiusKm` are no longer profile fields on
    `PATCH /vendors/me` (dropped if sent), so nothing turns it on without
    the tick. Responses: `pickupEnabled`, `pickupTermsAcceptedAt` on the
    garage, the public garage and list items; admin's list and detail also.
  - Reach: `GET /vendors?bookingType=pickup` lists only garages offering it
    whose pickup radius from their pin covers the customer
    (`COALESCE(pickup_radius_km, 10)` km; no customer radius, no widening,
    as doorstep). Slots take `booking_type=pickup` with 3 hours' notice.
    A pickup booking (`POST /bookings`, `POST /booking-intents`) needs
    `addressId`, a saved address with a pin inside the radius (400
    `PICKUP_NOT_OFFERED`, `ADDRESS_REQUIRED`, 422
    `ADDRESS_LOCATION_REQUIRED`, 400 `OUTSIDE_PICKUP_RADIUS`), snapshots it
    like doorstep, and books the garage's services as drop-in does (they
    are the same services). Price: the services; `bookingTypeFee` is the
    one place a fee goes (0 today).
  - Codes: two different 4-digit codes made with `crypto.randomInt` when a
    pickup booking is written (all three insert paths; a reschedule carries
    them over). Only the customer's own booking payload has them
    (`pickup.pickupCode` until picked up, `pickup.deliveryCode` until
    delivered, none once the booking is off); the garage's payload has
    `pickup.nextStep` and the tries left instead, admin's the tries left and
    who overrode. 5 wrong tries lock a code (counted by a capped atomic
    increment, and the step's own write re-checks the cap).
  - Steps (garage, operators included): `PATCH /bookings/:id/picked-up
    { code }` → `/at-garage` → the normal `/progress` (refused before At
    garage) → `/out-for-delivery` → `/delivered { code }`, which completes
    the job (and collects a legacy cash payment, as Mark completed does).
    `/complete` is refused for pickup. Each step is a conditional update on
    the state checked (`pickupStepRefusal`): 409 `PICKUP_STEP_DONE` or
    `PICKUP_STEP_OUT_OF_ORDER`, 400 `HANDOVER_CODE_WRONG` (tries left), 409
    `HANDOVER_CODE_LOCKED`. Once the car is collected the customer can no
    longer cancel or reschedule (409 `CAR_WITH_GARAGE`; also in the
    conditional writes), and admin cannot mark a customer no-show.
  - Admin: `POST /admin/bookings/:id/pickup-step { step: 'picked_up' |
    'delivered', note }` confirms a code step for a customer who cannot give
    the code, in the job's order, storing the admin's name on the booking
    and the reason in the notes. Admin booking rows carry `pickup` (steps,
    tries left, overrides) and the pickup address.
  - Readiness: pickup on with no map pin (fix), a yes from onboarding with
    no terms (fix, "Pickup & drop not agreed"), pickup on with no radius
    (optional, 10 km default).
  - Ops alerts name the type ("Pickup & drop"). The pending-booking digest
    gains a section: an accepted, paid pickup job 30 minutes past its slot
    with no Picked up (posts when it crosses, then in the hourly reminders).
  - Home's Book again treats a pickup job like doorstep (needs the pin, and
    the garage still offering it).
  - Note: the doorstep "empty radius is 10 km" default is still only in PR
    #42; on this base an empty doorstep radius still matches no address.
    Pickup applies its 10 km default here already.

- **Complaint reference numbers with a response clock** (migration
  `0035_complaints`, additive: a `complaint_number_seq` sequence and a
  `complaints` table; no data step). Owner decision, 17 Oct 2026: every
  complaint gets a number and a visible clock, matching the Contact page's
  promise to acknowledge within 24 hours and resolve within 7 days.
  - `POST /users/me/complaints { category, message, bookingId? }` and
    `GET /users/me/complaints` (signed-in customer; mounted inside the users
    routes like Home). The booking must be the customer's own (anyone
    else's is 404 `BOOKING_NOT_FOUND`) and brings its garage; the schema is
    `.strict()`, so no garage, status or user id can be sent. Name, phone,
    booking reference and garage name are snapshotted on the row, and every
    foreign key is `ON DELETE SET NULL`, so `DELETE /users/me`, the
    test-data reset and Delete forever from the Bin keep the complaint.
  - The number (`C-000123`) comes from a sequence: concurrent complaints
    never wait on each other, and a rolled-back insert leaves a gap (a
    receipt number could not; a complaint number can).
  - Limits per customer, read under a per-customer advisory lock taken on
    its own (outside the booking-write lock order): at most 5 open or
    acknowledged (409 `COMPLAINT_LIMIT_OPEN`) and 3 an hour (429
    `COMPLAINT_RATE_LIMIT`).
  - Admin (`modules/complaints`, super-admin, mounted at
    `/admin/complaints`): `GET /?show=open|overdue|resolved|all` with every
    filter's count, `GET /:id`, `POST /:id/acknowledge`, `POST /:id/resolve
    { resolutionNote }` (required; the customer reads it), `POST /:id/close
    { resolutionNote? }`, `PUT /:id/note { adminNote }` (never sent to the
    customer). Each move is a conditional update from the statuses it may
    start from (409 `COMPLAINT_STATUS_CHANGED` otherwise) and records who
    did it by name. Resolving or closing an open complaint stamps the
    acknowledgement at the same moment.
  - The clock: `lib/complaints.ts` (pure, unit-tested), the twin of
    `packages/core/src/complaints.ts` (parity test). Overdue is open past
    24 hours, or not resolved or closed past 7 days; the admin list's SQL
    compares against cutoffs worked out from the same constants.
  - Telegram: `complaint_received` ("📣 New complaint C-000123 · Payment or
    refund", the garage and booking, the customer's first name, their words
    quoted and scrubbed, "Acknowledge by …" and the admin link), through
    `alertOps`, so Production only.
  - Start pilot clean: a cutoff run lists the complaints made before the
    cutoff as one row with one tick (`only.complaints`; ticked on the first
    look, unticked when `only` leaves it out), counts them (`complaints`,
    "3 complaints"), deletes them before the bookings, puts their ids in
    the fingerprint (only when there are any) and their ids in the audit
    row. A run of complaints alone types `DELETE 3 COMPLAINTS`.

- **The garage Bin: move to bin, restore, delete forever** (migration
  `0034_garage_bin`, additive: `vendors.deleted_at`, `deleted_by_name`,
  `deleted_reason`, `purged_at`, a CHECK that only a garage in the Bin is
  purged, and a partial index on `deleted_at`; no data step). Owner
  decisions, 16 Oct 2026: Archive stays as it is; the Bin is for garages
  being deleted.
  - One rule, "in the Bin" = `deleted_at IS NOT NULL`, in
    `modules/vendors/vendors.predicates.ts` (`NOT_IN_BIN`, `vendorNotInBin`,
    `isInBin`, `vendorPageOpen`). `LISTED_TO_CUSTOMERS` / `isListedToCustomers`
    gain it (the list, search, map, Home Nearby, offers, offer reach), and so
    does every customer read that skips the list: the garage page and its
    services, packages, slots, hours and holidays, public reviews, checkout,
    `checkGarageCanTake` and `garageRefusalForBooking` (a binned garage is
    refused as a paused one), and Home's Book again.
  - Its team is locked out: the seat reads (`listActiveVendorSeats`,
    `findActiveVendorSeat`, `hasActiveVendorSeat`, `countActiveVendorSeats`)
    join the garage and leave the Bin out, `resolveTenant`'s support-session
    path answers 404 for a binned (or unknown) garage before writing its
    access record, and every seat holder's `is_vendor_owner` is re-synced on
    bin, restore and delete, so the owner of a binned garage no longer passes
    the vendor login unless they still have a live one.
  - `GET /admin/vendors/:id/bin-preview` (bookings still to come, which are
    paid), `POST /admin/vendors/:id/bin { actorName, reason? }`,
    `POST /admin/vendors/:id/restore { actorName }`,
    `GET /admin/vendors/:id/delete-preview`, and
    `DELETE /admin/vendors/:id { actorName, confirmName, selectionHash }`,
    in `modules/vendor-bin`, super-admin only, each writing `admin_audit_log`
    (`garage_binned`, `garage_restored`, `garage_deleted`) with the typed
    name. Binning cancels the garage's pending, confirmed and in-progress
    bookings through the admin cancel ("Garage removed", Detlio's own
    decision), so a paid one is a refund owed as today; nothing is refunded
    automatically. Delete forever is only for a garage in the Bin, with its
    name typed: the test-data reset's planner and deletes
    (`lib/data-reset.ts`, new `garage` scope; `deletePlannedRows`,
    `finishRestarts`) take every booking chain and checkout of the garage,
    keeping real money (live, cash, unconfirmed, may still arrive) and voiding
    or restarting receipt numbers as the reset does. With nothing kept the
    garage row goes, in an order the RESTRICT foreign keys allow (package
    contents, the checkouts and bookings, services, then the garage); with
    something kept it stays as a tombstone (`purged_at`; name, address, city
    and pincode kept for receipts; contact fields cleared; photos, media,
    hours, team seats and unreferenced services removed, the rest off sale).
    The garage's R2 files and Stream videos are removed after the commit, best
    effort, and the team gets a Telegram alert, "Garage deleted by <name>:
    <garage>, N bookings". Lib rules in `lib/vendor-bin.ts`, unit-tested.
  - Any other admin write on a binned garage (edit, verify, archive, pause,
    services, media, team, service photos and videos) is 409
    `VENDOR_IN_BIN`. `GET /admin/vendors` carries `deletedAt`,
    `deletedByName`, `deletedReason` and leaves tombstones out; a tombstone's
    detail is a 404. Discount and notice pickers and their garage checks, and
    the demand/supply grid, leave binned garages out.
- E2E fixtures: `VENDORS.binTeam`, `binOwnerLive`, `binPaid`, `binHard`,
  `binTomb`, `STAFF.binOwner`, `STAFF.binOperator`, `CUSTOMERS.bin*` and
  their bookings and checkout, for `specs/admin/garage-bin.spec.ts`.

### Removed

- The old outright `DELETE /admin/vendors/:id` and its 409
  `VENDOR_HAS_BOOKINGS`: a garage is deleted from the Bin now.

- **Add garage from a poster, photo, PDF or Tally export** (no migration).
  `POST /admin/vendor-imports/extract` (super-admin, `AI_IMPORT_RATE_LIMIT`
  per admin per hour, default 30) takes either `{ source: 'files', files }`
  (1–5 JPEG/PNG/WebP/PDF as base64, about 3 MB in all so the request stays
  under Vercel's 4.5 MB body cap; the panel shrinks photos to 2000 px first)
  or `{ source: 'tally_csv', csv }`, and answers `{ garages: [{ label,
  draft, fields }] }`: a draft shaped like the create-vendor input and, per
  field, `sure` / `check` (with a short reason) / `missing`. Nothing is
  saved and the files are never stored or logged (only counts, sizes and
  timing), and every Responses call (the text client's too) now sends
  `store: false`, since the API otherwise keeps the response for at least
  30 days; the garage is created by the ordinary `POST /admin/vendors`.
  Photos and PDFs go to OpenAI through `lib/ai.ts`'s new `DocumentClient`
  (Responses API, `input_image` / `input_file`, strict JSON-schema output,
  model `AI_VISION_MODEL`, default `gpt-5.5`; 50 s timeout and no retry,
  under the function's 60 s, now set in `vercel.json`). The model only
  copies what is written; every decision is plain code in
  `lib/garage-import/` (unit-tested): phones to 10 digits, "Call" / "on
  inspection" → On inspection with the fee missing, "from ₹X" → X to check,
  more than three car sizes or combos kept in the description to check, a
  missing time never guessed, the owner phone always to check (and, when
  it was copied from a garage landline, said to be no use for signing in).
  A Tally CSV
  is parsed without AI (header → field table in `lib/garage-import/tally.ts`;
  unknown columns ignored; one garage per row). Every draft is held to the
  create endpoint's own zod schemas before it is returned. Errors: 503
  `AI_UNAVAILABLE` (no key, or OpenAI not answering), 422
  `IMPORT_UNREADABLE`, 413 `IMPORT_TOO_LARGE`. `GET /admin/ai/config` gains
  `import` (false without `OPENAI_API_KEY`; the CSV import works either
  way). `POST /admin/vendor-imports/owner-account { phone }` says whose
  account an owner phone already belongs to (name, customer, garages
  owned), so the form can say who Create will attach the garage to; a POST
  so the number stays out of URLs and logs. With `AI_FAKE=1` every file
  reads as one fixed poster (`FAKE_GARAGE_READING`), for E2E.

- **Live and a "what's missing" checklist on the admin garage list** (no
  migration). `GET /admin/vendors` still returns every garage as one array
  (the Bookings garage filter and other pickers read it), and each now also
  carries `live`, `readiness`, `hasDoorstepArea` (the full row already had
  `dropinEnabled`, `doorstepEnabled`, `doorstepRadiusKm`). `live` is
  `isListedToCustomers` in `modules/vendors/vendors.predicates.ts`: Active,
  verified and not paused. Its SQL twin, `LISTED_TO_CUSTOMERS`, is now what
  the customer lists (`listPublicVendorPage`) and Home's Nearby count run,
  so the panel's Live and what customers can find can't disagree; a test
  pins the two together. `readiness` is `lib/vendor-readiness.ts` (pure,
  unit-tested): items `{ key, severity, label, detail?, short, tab }`,
  blocking first. Blocking: no active services; neither drop-in nor
  doorstep on; no opening hours (no rows, or closed every day). Fix: no map
  pin, or a pin not confirmed; services without a description (counted);
  car types empty or holding a retired one ("Luxury / Premium",
  "Electric (EV)", "Commercial / Van"; compared without case or spaces, so
  the seeds' "hatchback", "suv" pass); bays empty or 0. Optional: no logo;
  no photos; doorstep on with no travel radius and no drawn area ("Default
  10 km used"). Distance from Chennai is not checked. Packages are left out
  of the services rules, as everywhere in admin. The list reads services'
  descriptions, photo ids and weekly rows in the same relational query, and
  the drawn areas in one more (`doorstep_area` is not in the Drizzle
  schema): three queries for the whole list, none per garage.
- E2E fixture: `VENDORS.adminList` ("Admin List Test Garage"), pending and
  set up but for its services, for the list's checklist specs.

- **"Write with AI" for service descriptions, on OpenAI** (no migration).
  `POST /admin/services/describe { name, category, pricingType,
  durationMins?, garageName? }` returns `{ description }`: a draft for the
  admin editor's field, never saved by the call. `GET /admin/ai/config` says
  `{ describe, pictures }` (pictures: the AI sample pictures below), each
  false while `OPENAI_API_KEY` is unset, which is how the panel knows to
  hide the buttons; one route for every AI helper. Both super-admin only. The one AI wrapper
  is `lib/ai.ts` (the official `openai` SDK, pinned at 7.34.0; Responses API,
  20 s timeout, one SDK retry); the model is `AI_TEXT_MODEL`, default
  `gpt-5.5`. Every answer is checked by `lib/service-description.ts`: 1–2
  plain sentences, at most 200 characters, ending in a full stop, no price,
  no time unless a duration was given, nothing `lib/copy-rules.ts` bans and
  none of best / 100% / permanent / perfect / showroom and the like. A
  failing answer is asked for once more with the reason; then 422
  `AI_NO_DESCRIPTION`. Any SDK error (rate limit, timeout, bad key, outage)
  is 503 `AI_UNAVAILABLE`, as is calling it with AI off. Only the service's
  facts and the garage's business name are sent; the body is `.strict()`.
  Rate limited per admin per hour (`AI_DESCRIBE_RATE_LIMIT`, default 60;
  `createRateLimiter` takes a key function now, IP still the default).
  `AI_FAKE=1` answers with a fixed sentence and calls nothing (E2E); the
  server refuses to boot with it in production. What each ending becomes is
  `modules/ai/ai.describe.ts`, unit-tested with fake clients; the OpenAI
  client itself is tested against a canned `fetch`.
- `GET /admin/vendors/:id` also says `hasDoorstepArea` (no migration): true
  when the garage drew its own doorstep area in the garage app, which then
  decides who is covered and leaves `doorstepRadiusKm` unread. The editor's
  "How customers book" says so instead of quoting the radius.
- E2E fixtures: `VENDORS.adminEditor` with `SERVICES.editorFoam` (named like
  the Foam wash template) and `SERVICES.editorPolish` (no description), for
  `specs/admin/garage-editor.spec.ts`.

- **An "Outside Chennai" sign on garages in other towns** (owner decision,
  2026-10-16; no migration). Garages in other towns stay in the pilot, but
  each says it is not in Chennai. `GET /vendors` items, `GET /vendors/:id` and
  `GET /admin/vendors` rows gain `outsideServiceCity: { town, km } | null`:
  set when the garage's pin is more than 50 km (`LIST_RADIUS_KM`) from the
  Chennai centre (13.0827, 80.2707), straight-line, judged before rounding
  (exactly 50 km is in). `town` is the garage's own city field, tidied
  (all-capitals or all-lowercase put in title case), or null when it says
  Chennai (or Madras) or is empty; `km` is a whole number. A garage with no
  pin is still listed (after the pinned ones, even near a Chennai customer),
  so its own city field decides: a town other than Chennai gives
  `{ town, km: null }`, unless its pincode is a Chennai one (600xxx: a suburb
  such as Tambaram typed as its own town); Chennai or empty gives null
  (unknown). Null for a garage in the city. A sign only: nothing is hidden or
  refused. The rule is `lib/service-city.ts` (`SERVICE_CITY`, the
  one service-city constant, and `outsideServiceCity`, unit-tested); a parity
  test keeps its centre, reach and distance formula equal to the customer
  map's (`DEFAULT_CENTER`, `straightLineKm`) and to `@repo/core/service-city`.
- **Hidden services, from admin** (no migration).
  `GET /admin/vendors/:id/services/hidden` lists a garage's switched-off
  plain services (packages left out, as everywhere in admin), and
  `PATCH /admin/vendors/:id/services/:serviceId/active { isActive }` hides
  one or shows it again, through the garage's own `toggleServiceActive`, so a
  hidden service is never deleted and keeps its bookings. Super-admin only,
  like the routes beside them. A package, or another garage's service, is a
  404 `SERVICE_NOT_FOUND`; hiding a service that is inside a package is a 409
  `SERVICE_IN_PACKAGE` naming the package, since the package would still list
  it. The body takes `isActive` and nothing else (400 otherwise). The admin
  editor's save is unchanged: it still hides any live service missing from
  the list it sends.
- `GET /admin/vendors` carries `bookingCount` on each garage: every booking it
  has ever had, in any state, from one grouped count (no query per garage).
  It is the count `DELETE /admin/vendors/:id` refuses on (409
  `VENDOR_HAS_BOOKINGS`, unchanged), so the admin list can say so before
  anyone presses delete.

- **Service photos and videos** (migration `0033_service_media`, purely
  additive; applied by CI on merge). `service_images` gains `kind`
  (`image`/`video`), `source` (`upload`/`ai`), `consent_confirmed_at`,
  `uploaded_by`, and for videos `video_uid`, `video_status`
  (`processing`/`ready`/`error`), `video_error`, `duration_secs` and
  `poster_url`. Up to `R2_MAX_IMAGES_PER_SERVICE` (3) photos and one video
  per service, checked under a per-service advisory lock. Rules in
  `lib/service-media.ts`, routes in `modules/service-media`; setup for Lokesh
  in `docs/service-media.md`.
  - **The privacy tick.** `POST …/images` (garage and admin) and the new
    `POST …/videos` need `consent: true`, or answer 400
    `MEDIA_CONSENT_REQUIRED`. A photo URL must sit in its own service's
    folder. A real photo, or a video once it is ready, removes any AI sample
    of that service.
  - **Video through Cloudflare Stream** (`lib/stream.ts`, plain fetch): a
    one-time direct creator upload (≤ 200 MB) or a tus upload (larger),
    `maxDurationSeconds` 60. `POST /vendors/me/services/:id/videos` and
    `POST /admin/services/:serviceId/videos` (`sizeBytes`, `durationSecs`,
    `replaces`) answer with the row and where to send the file;
    `GET …/media/:mediaId` is the upload block's poll and asks Stream about a
    still-processing video. `POST /api/v1/webhooks/cloudflare-stream` takes
    Stream's webhook, signed (`Webhook-Signature`, HMAC-SHA256 of
    `time.body`, five minutes' tolerance). Off — routes 404, slot hidden —
    unless `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`,
    `CLOUDFLARE_STREAM_CUSTOMER_CODE` and `CLOUDFLARE_STREAM_WEBHOOK_SECRET`
    are all set. A replaced video stays on the garage page until the new one
    is ready, and stays for good if the new one fails or is removed; only then
    is it deleted. Removing or replacing a video deletes it from Stream after
    the commit, best effort.
  - **AI sample pictures (admin).** `POST /admin/services/:serviceId/ai-pictures`
    (`prompt`) makes two options with OpenAI's image model (`openai` SDK,
    `AI_IMAGE_MODEL`, default `chatgpt-image-latest`; 1536×1024, medium, WebP,
    `n: 2`) and leaves them under `ai-temp/<serviceId>/` in R2;
    `POST …/ai-pictures/use` copies the chosen one into the service's folder
    as a `source: 'ai'` photo and removes the options. Only for a service with
    no real photo or video (409 `AI_PICTURE_NOT_NEEDED`); 20 presses an hour
    per admin (`AI_PICTURES_PER_HOUR`, 429 `AI_PICTURE_LIMIT`); OpenAI
    failures are 503 `AI_UNAVAILABLE`. Email addresses, phone numbers and
    number plates are stripped from the prompt, and a fixed style ("no
    people, no text, no logos, no number plates") is always added. Off while
    `OPENAI_API_KEY` is unset: `GET /admin/ai/config` says
    `pictures: false` (beside "Write with AI"'s `describe`) and the routes
    are 404. Its SDK calls live in `lib/ai-images.ts`, on the same pinned
    `openai` as `lib/ai.ts`.
  - `GET /vendors/me/media-config` and `GET /admin/media-config` tell the
    upload block whether video is on.
  - Service responses carry `media`: on the garage page (public) only a
    photo's or a ready video's `kind`, `url`, `posterUrl`, `durationSecs` and
    `source` — never who added it or the tick; in the garage's own app and
    admin every row with its state. `images` stays, photos only.
  - Test fakes, refused in production like `E2E_FAKE_PAYMENTS`:
    `STREAM_FAKE=1` (uploads land on `/api/v1/fake-stream`, a spec fires the
    signed webhook) and `AI_FAKE=1` (a fixed PNG, OpenAI never called).

- **Statistics and Detlio commission** (no migration). Super-admin only:
  `GET /admin/stats/overview?from&to&vendorId&compare=1` (bookings, collected
  after refunds, commission, average booking, checkout → paid, cancellations,
  bookings per day and collected per week, with the period before),
  `GET /admin/stats/breakdown` (funnel from checkout to completed, garages
  with ratings, service types, busy hours by slot) and
  `GET /admin/stats/commission` (the rule, the period's commission, garages
  paying it and those in their free 25). IST dates, both included, at most
  366 days (400 otherwise); each read in a read-only transaction with a 10 s
  statement timeout (503 `STATS_TIMEOUT`). Definitions in `lib/stats.ts`: a
  reschedule chain counts once, dated by its first booking; collected after
  refunds is payments and paid final bills less `refund_records` on them
  (a stray payment on a replaced bill, and its refund, count for nothing);
  bookings marked Test and their checkouts are left out everywhere.
  - Commission is reporting only (`lib/commission.ts`; payouts, earnings and
    receipts are unchanged): 8% on car wash, packages and others, 5% on
    detailing, coating and scratch removal, per booking item on the full
    price (before a Detlio-funded promo, after a garage-funded discount),
    plus a paid final bill at the main service's rate, on bookings that earn
    the garage a payout from its 26th received booking on. The first 25
    count every booking the garage received, cancelled ones included.
  - E2E fixtures: `VENDORS.stats` and `CUSTOMERS.stats` with 37 booking rows,
    two checkouts, two reviews and two final bills, one of them a refunded
    stray payment (`STATS` in `e2e-ids.ts`).

- **Start pilot clean: deleting test data** (migration `0032_test_data_reset`,
  purely additive; apply it before deploying). Behind `ADMIN_DATA_RESET=on`,
  off by default: every `/admin/data-reset` route is then a 404. Runbook in
  `docs/test-data-reset.md`, which replaces the PR #21 "TRUNCATE + re-run
  0030" reset.
  - `GET /admin/data-reset/config`, `POST /admin/data-reset/preview` (the dry
    run) and `POST /admin/data-reset/execute`, super-admin only. Scope:
    everything before a cutoff, the chains marked Test, or one marked chain.
    A booking goes with its whole reschedule chain and everything attached
    (items, payment, notes, job photos and their R2 files after the commit,
    final bills, reschedules, promo uses, refunds, reviews, its checkout);
    a cutoff run also takes checkouts that never became a booking, with their
    refund records. The rules are pure, in `lib/data-reset.ts`, unit-tested.
  - Real money is never deleted: live, cash and unconfirmed payments keep the
    chain, shown as "Real payment — kept". `gateway_mode` (`live` / `test` /
    `fake`) is now recorded on payments, checkouts and final bills from the
    key id the order was opened with; older rows are checked with Razorpay
    in the dry run, a slice per call inside a time budget, and the answer is
    written back. Unknown is always kept. An unpaid order that may be live
    and could still be captured (a booking still on, a bill still due, or
    within a day of the cancel or the checkout closing) keeps its chain or
    checkout too: "Payment may still arrive — kept".
  - The dry run lists the whole scope whatever is ticked, so its CSV and the
    audit row include the kept rows (with the reason) and the unticked ones.
    More ticked than a run's cap (300 bookings, 1,000 checkouts) is no
    longer a 400: the oldest are taken and `overCap` says how many wait.
  - Receipt numbers are never renumbered: a financial year whose receipts
    are all test data restarts at 000001; any other year keeps its counter
    and records the deleted numbers in `receipt_number_voids`.
  - The delete re-checks the dry run's `selectionHash` (409 `PREVIEW_STALE`)
    and the typed phrase (400 `CONFIRM_PHRASE_MISMATCH`) under row locks, in
    one transaction with `lock_timeout`/`statement_timeout`, in the lock
    order; writes an append-only `admin_audit_log` row; and posts "Test data
    cleared by <name>: N bookings" to Telegram.
  - `POST`/`DELETE /admin/bookings/:id/mark-test`: the "Test" mark on a whole
    chain, with a note. Marked bookings are left out of the pilot numbers,
    `GET /admin/bookings?test=only|hide` filters on it, and the booking rows
    carry `markedTest` and `payment.gatewayMode`. A reschedule keeps the mark.

- **Estimated reach for offers on Home** (no migration). PR 2 of 6 of the
  Home hub (the admin screens). `GET /admin/discounts/home-reach?audience=&vendorId=&radiusKm=&vehicleTypes=`
  counts how many signed-in customers the discount form's Show on Home
  settings would reach today, before they are saved, by asking Home's own
  `offerSkipReason` of each customer (`lib/offer-reach.ts`, unit-tested):
  a garage's offer needs a car, a garage that is not live for customers
  reaches nobody (`garagePublic: false`), and with `HOME_OFFER_TARGETING`
  off every audience but `everyone` is refused, 409 `TARGETING_DISABLED`,
  as a save is. Only the facts the chosen audience reads are loaded, so
  `everyone` reads no booking history or location. "Near this garage" is
  measured from each customer's nearest saved address (`measuredFrom:
  'saved_addresses'`), since Home's live location is never stored; usage
  limits and dismissals are left out. Settings that don't fit together are
  a 400 `DISCOUNT_HOME_INVALID`, by the same rule as a save. Both refusals
  are decided by `reachSettings` in `lib/offer-reach.ts` before any customer
  data is read, and unit-tested with targeting off; the API spec covers
  every audience's query, `wash_due` and `car_type` included.
- Parity tests for the admin's twins in `@repo/core`: the offer card's small
  print (`offer-preview.ts` against `offerMetaLine`, `tillLabel`,
  `endsSoonLabel`) and the notice link rule (`notice-link.ts` against
  `isAllowedNoticeLink`).

- **Home hub data** (migration `0031_home_hub`, purely additive; apply it
  before deploying). PR 1 of 6 of the customer Home hub; the screens come
  later, behind their own flag.
  - `GET /users/me/home?lat=&lng=`: one read for Home — header (first name,
    avatar, unread bell), one must-act card (a bill to pay, then the garage
    shut on a booking's day), up to 3 offers, "Rate your wash" only when
    there is no must-act card, each saved car with its wash bar and one tile
    (next booking with any team notice about it as one line, before & after
    photos once the garage took an after photo, Book again priced for the
    car's type with `pricedOnInspection` when the price is only an
    inspection fee, garage not taking bookings, or nothing booked), the
    newest Updates rows under the pinned notice, nearby garages within
    10 km, and the car-care tip of the day. `nextBooking` carries a live
    booking when the customer has no saved car left. Book again judges the
    garage the way its page books (active, verified, not paused, still
    offering drop-in or doorstep; a map pin only for doorstep), so a garage
    without a pin still takes its drop-in customers back. Empty `lat`/`lng`
    are no location. Optional parts fail on their own and come back null.
  - `GET /users/me/updates` (To do, pinned notice, last 30 days, read
    marker, and the server's `now` for the app to send back) and
    `POST /users/me/updates/seen` (moves the marker forward only, never
    past the server clock; 204). Rows are derived from the bookings' own
    timestamps: accepted, reminder (18:00 IST the day before; skipped for a
    booking made after it or accepted on the day itself), started, done,
    photos, bills, receipt, declined or cancelled (with "Refund due" only
    when `lib/refunds.ts` says money is owed), refunded (the bank's timing
    hedged as on the booking page, and only for a Razorpay refund), moved,
    garage paused, and team notices about the customer's own booking first
    (for as long as they are live, dated no earlier than the booking).
  - `POST /users/me/notices/:id/dismiss`, `POST /users/me/offers/:id/dismiss`,
    `POST /bookings/:id/review-prompt/dismiss` (owner only; 404 otherwise):
    204, and repeating them changes nothing. An offer since taken off Home
    can still be closed; only an unknown id is a 404.
  - Offers on Home: discount codes gain `showOnHome`, `homeTitle`,
    `homePriority` (Normal/High/Top), `homeAudience`,
    `homeAudienceRadiusKm` and `homeAudienceVehicleTypes`, checked on the
    merged row of a PATCH (400 `DISCOUNT_HOME_INVALID`; a CHECK violation is
    a 400 `DISCOUNT_INVALID`, not a 500), and banned words in a title are a
    400 `COPY_NOT_ALLOWED`. The audience is display targeting only — it
    never changes who may use the code at checkout — and every audience but
    `everyone` is switched off by `HOME_OFFER_TARGETING` (off by default):
    such offers are not shown, booking history and location are not read
    for offers, and setting one is a 409 `TARGETING_DISABLED`.
    `GET /admin/discounts/home-config` gives the form the settings and the
    switch's state.
  - Team notices: `GET/POST /admin/notices`, `GET/PATCH /admin/notices/:id`,
    `POST /admin/notices/:id/end` (a live one ends now; a scheduled one is
    switched off) and `GET /admin/notices/audience-count`. No delete. A link
    is `https://…` or an app path, never `//host`, a backslash or
    whitespace (the CHECK holds the same rule); the link's label passes the
    copy rules like the title and body.
  - `PATCH /users/me/vehicles/:id` takes `washIntervalDays` (7, 10, 14, 21,
    30, or null for the default); vehicle payloads gain it.
  - Pure, unit-tested rules: `lib/wash-status.ts`, `lib/home-updates.ts`,
    `lib/home-cards.ts`, `lib/offers.ts`, `lib/notices.ts`,
    `lib/car-tips.ts`, `lib/copy-rules.ts` (twinned in `@repo/core`, with a
    parity test) and `lib/ist.ts`.

- **Search by service** (no migration). `GET /vendors?q=` also matches the
  name of any active service of the garage (packages included), alongside
  its name and city, in the one clause the list, the map and both segments
  share. The search text's `%`, `_` and `\` are literal now (`containsPattern`,
  moved to `lib/search.ts`): a lone `%` matched every garage. Each list item
  gains `matchedService`, the service a garage was found by when its name and
  city did not match (null otherwise; `matchedServiceName`, unit-tested).
- Customer booking payloads gain `moved`: the customer moved this booking to
  a new time, so the app leaves it out of My bookings. `toVendorBookingResponse`
  drops it.

- **Payment receipts** (migration `0030_receipt_numbers`, which must be
  applied before deploying). `GET /bookings/:id/receipt` gives the customer a
  receipt for a booking whose payment went through (paid, collected, or
  refunded since), built by the pure `lib/receipts.ts`: the receipt number,
  the services as sold, the discount, the booking payment with its Razorpay
  payment id, a paid final bill as its own section, each refund as its own
  line, and the net paid. Only the booking's customer can read it; anyone else
  gets 404 `BOOKING_NOT_FOUND`. A booking with nothing paid, or one the
  customer moved (its payment went with it), gets 404
  `RECEIPT_NOT_AVAILABLE`. Cancelled bookings and customer no-shows still have
  one. It is a payment receipt, not a tax invoice: no GSTIN and no tax lines
  until the CA confirms the GST setup. Customer booking payloads gain
  `receiptAvailable`; `toVendorBookingResponse` drops it.
- **Receipt numbers** are consecutive per Indian financial year, as the
  Consumer Protection (General) Rules, 2020 (rule 5(1)(b)) ask:
  `DTL/<FY>/<serial>`, e.g. `DTL/26-27/000123` (16 characters; the FY runs
  1 April to 31 March in IST; the serial starts at 000001 each year and a
  serial past 999999 is refused rather than written as 17 characters). One
  number per reschedule chain, keyed by its first booking, issued once and
  never changed: in the same transaction as the booking's own payment going
  through (`settlePayment` for verify and the webhook, `consumeIntent`, and
  cash collected on completion, now `markCashCollected`), from a gapless
  counter row per year (`receipt_counters`, bumped with `UPDATE … RETURNING`,
  so a rolled-back payment gives its number back; not a SEQUENCE). Its row
  lock is the last lock in every transaction: `allocateReceiptNumber` takes
  KEY SHARE on the chain's first booking before it (the lock the
  `receipt_numbers` foreign key would otherwise take after it), and
  `settlePayment` now locks the booking it settles before the vendor-day
  lock, as a reschedule does, so the two cannot deadlock. Reschedules and
  final bills take no number of their own. Numbering runs in a savepoint: if
  it fails (even before 0030 is applied) only the numbering is rolled back,
  the payment still stands, and it is logged (`receipt:number_failed`) and
  alerted to ops (`receipt_number_failed`, at most once per 10 minutes per
  instance). The receipt read issues a number the first time it finds one
  missing, logging `receipt:number_issued_late`; two first views at once
  still get one number. If it cannot, the read answers 503
  `RECEIPT_NUMBER_PENDING` ("Your receipt isn't ready yet…") rather than a
  500. 0030 creates `receipt_numbers` and `receipt_counters` and numbers
  every receipt that already exists, in the order the payments went through;
  it is safe to re-run. The unused `paymentsRepository.markPaid` and the
  generic `bookingsRepository.updatePaymentStatus` are gone, so nothing marks
  a payment paid without a number. Admin booking search also matches a whole
  receipt number, however its separators are written (`DTL/26-27/000123`,
  the PDF file name's `DTL-26-27-000123`, or with spaces), and finds every
  booking of its chain.
- **Deleting an account that has a receipt number** (`DELETE /users/me`) is
  refused with 409 `ACCOUNT_HAS_RECEIPTS`: a number is never reused or
  renumbered, so the bookings it was issued on are kept. It used to cascade
  into those bookings and fail on the `receipt_numbers` foreign key as a 500.
- **Who issues the receipt** is `RECEIPT_ISSUER` in `lib/receipts.ts`: Detlio,
  "Operated by ScrubCars" (the sole proprietorship that runs it), with its
  business address (expected on receipts by the consumer rules; keep it the
  same as the Razorpay account's) and the support inbox,
  contact.scrubcars@gmail.com for now.
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

- **A garage's contact details stay private until the customer books**
  (owner decision, 17 Oct 2026). `GET /vendors/:id` (the public garage page,
  no auth) is now an allow-list (`modules/vendors/vendors.public.ts`
  `toPublicVendor`) instead of the garage's own shape minus `ownerId`. It no
  longer carries `phone`, `whatsapp`, `email`, `address`, `mapsUrl`, `notes`,
  `pickup` (the stored answer; `pickupEnabled` stays),
  `pickupTermsAcceptedAt`, `geoSource`, `geoConfirmedAt`, `bays`,
  `jobsPerDay` or `vehicleTypes`. It keeps `id`, `businessName`, `logoUrl`,
  `city`, `pincode`, `lat`/`lng`, `yearsInOperation`, `isVerified`,
  `status`, `dropinEnabled`, `doorstepEnabled`, `doorstepRadiusKm`,
  `pickupEnabled`, `pickupRadiusKm`, `slotIntervalMins`,
  `bookingsPausedAt`/`Reason`, `createdAt`, and the photos, services and
  rating as before. A customer gets the garage's phone, WhatsApp, address,
  pin and maps link only on their own booking (`GET /bookings/:id`, owner
  only; a vendor member gets its own garage). `GET /vendors` (list, search,
  map) already sent none of them; reviews, offers, Home, checkout and slots
  send the garage's name at most. Admin (`/admin/vendors/:id`) and the
  portal (`/vendors/me`) are unchanged.
- **"Rate your wash" lasts 14 days** after the job (was 72 hours;
  `RATE_PROMPT_DAYS` in `lib/home-cards.ts`), on Home (still below the
  offers and only with no must-act card, so at most two cards above the car)
  and on Updates' To do (every unrated job, newest first). Never for a
  cancelled booking, a no-show of either side or a moved booking. The ×
  (`POST /bookings/:id/review-prompt/dismiss`) is unchanged.

- **Every garage within 50 km, nearest first** (owner decision, 2026-10-16;
  no migration). `GET /vendors` with a location searches one radius,
  `LIST_RADIUS_KM` = 50 (`lib/discovery.ts`, unit-tested), the same on every
  page, in place of the 10 → 25 → 50 km ladder. The ladder stopped at the
  first ring with anything in it, so one garage within 10 km hid every garage
  11–50 km away, and page 2 restarted it at 10 km and could skip from page 1
  straight to the unpinned tail. The response gains `radiusKm`, the bound
  searched (set whenever a radius applied, even with no results; null with no
  location, for doorstep, for the map's `bbox` and for a typed search).
  `appliedRadiusKm` is **deprecated and always null**, so web bundles from
  the ladder days print nothing rather than "Nothing within 10 km"; remove it
  in a later release. An explicit `radiusKm` (at most 50) is still honoured.
- **A typed search (`q`) has no radius**: a garage is found by its name
  wherever it is, still nearest first when there is a location.
- **Home's Nearby card counts within 50 km** (`NEARBY_RADIUS_KM` is now
  `LIST_RADIUS_KM`), matching the pinned part of the list; `nearby.radiusKm`
  reads 50.
- **The doorstep travel radius is optional** (owner decision). A doorstep
  garage with no radius and no drawn area covers `DEFAULT_DOORSTEP_RADIUS_KM`
  = 10 km from its pin (`lib/doorstep.ts`, with a parity test against its
  `@repo/core/doorstep` twin) in the Doorstep list *and* in the check when a
  doorstep booking or checkout is made (`isWithinDoorstepRadius`), so a garage
  listed for an address can be booked to it. Before, it covered 0 km and
  vanished for every customer with a location. `PATCH /vendors/me/job-types`
  no longer refuses turning doorstep on without a radius
  (`DOORSTEP_RADIUS_REQUIRED` is no longer sent), and `PATCH /vendors/me`
  takes `doorstepRadiusKm: null` to clear a saved radius, so the default
  applies (the garage portal sends it when the field is emptied; before, an
  emptied field kept the old number).
- **Unpinned garages are no longer listed on the Doorstep tab**, with or
  without a location: a doorstep booking checks coverage from the garage's
  pin, so they could never be booked. Drop-in and browse lists still append
  them after the located garages.
- **`DELETE /users/me` refuses a garage owner's account**: 409
  `VENDOR_OWNER_ACCOUNT`, "This number owns a garage on Detlio, so the
  account can't be deleted here. Contact support to close it." Deleting the
  user row cascaded through `vendors.owner_id` into the garage, its services,
  and its bookings and payments from other customers. Checked before the
  receipts refusal (`ACCOUNT_HAS_RECEIPTS`, unchanged), and both are decided
  in `lib/account-deletion.ts` (unit-tested). The customer app still has no
  button for this endpoint.
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

### Security

- **Login codes are stored as a keyed hash, and deleted after a day.**
  `otp_verifications.otp_code` now holds ten base64url characters of
  HMAC-SHA256 over purpose, phone and code (`lib/otp.ts`), keyed by
  HMAC(`JWT_SECRET`, `'otp-v1'`), and is compared in constant time. No
  migration and no new env var: the digest fits the existing varchar(10).
  Codes written before the deploy (plain six digits) are still accepted for
  their three minutes; that branch (`isPlainOtpRow`) can go in a later
  release. Each code sent also deletes up to 500 codes that expired more than
  24 hours ago (by `expires_at`, the indexed column), after the SMS and
  best effort. BYPASS_PHONES unchanged. The E2E `latestOtp` helper now sets
  the row to the hash of a code it chooses, since the texted code can no
  longer be read back.
- **Admin discount search** builds its pattern with `containsPattern`
  (`lib/search.ts`) like the other searches; `escapeLike` is split out of it
  and also used for the final-bill payment note lookup, whose Razorpay id
  (`pay_…`) carries a LIKE wildcard.

- **The admin's internal vendor notes no longer leave the admin API.**
  `notes` (the "Notes (optional)" under Onboarding status) was on the vendor
  response shape, so `GET /vendors/:id` showed it on every public garage page
  and the garage's own `/vendors/me` payloads carried it too. It is dropped
  from that shape; the admin vendor endpoints still return it. E2E asserts
  the public page has no `notes`. Garages can no longer write it either:
  `notes` is gone from `POST /vendors` and `PATCH /vendors/me` (a sent one is
  dropped, unit-tested), so a garage cannot wipe the ops note or write one
  that reads as if staff had.

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
