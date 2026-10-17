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
