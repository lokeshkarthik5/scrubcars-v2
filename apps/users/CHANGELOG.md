# Changelog — web

Customer, vendor and admin front end. Versioned independently of the API; see
`server/CHANGELOG.md` for that side.

The version lives in `web/package.json`. `next.config.ts` inlines it at build
time as `NEXT_PUBLIC_APP_VERSION`, and the app prints it to the browser console
on load, so a bug report can name the build it came from. Bump the version and
add a section here in the same commit.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Dates before 0.2.0 come from the git history and summarise commits rather than
reconstructing every change in them.

## [Unreleased]

### Added

- **Final bill for inspection jobs.** After inspecting the car the garage
  raises the final bill on the job card ("Raise final bill": lines with
  amounts, a live total, what the customer already paid and the balance, and
  an optional note; a first bill starts from the services booked), and can
  replace it until it is paid. The customer sees it
  on their booking — lines, total, "Paid at booking" (with any discount kept
  and shown), "To pay" — and pays the
  balance with a red "Pay ₹Z", with the same no-double-payment handling as Pay
  Now; or reads "Nothing more to pay" when the work came to no more than the
  fee. The page keeps checking a finished inspection job for its bill for
  three days, and keeps a "will be refunded" outcome on screen if the garage
  replaced the bill mid-payment. Checkout and the service details sheet say how inspection pricing
  works, and the homepage FAQ answers it.
- **Job records.** The customer's progress steps show when each happened;
  the garage's job card says "Accepted 9:15 am · Started 10:42 am"; the admin
  timeline shows the times. Garages can add optional before and after photos
  to a job (shrunk to a 1600px JPEG on the phone before upload; removing one
  is done from the full-size view and asks first); customers see
  them once the work starts, admin on the booking.
- **Admin**: a "Bill due ₹Z" badge on bookings with an unpaid final bill, the
  bill and its Razorpay ids on the booking, and the median time from payment
  to the garage accepting on the pilot numbers card.

- **Holidays and pausing in the garage portal**: Settings has a Time off tab
  to add or remove holidays (warning when bookings are already on that day)
  and a "Pause new bookings" switch with an optional reason; Home shows a
  banner while paused. Settings → Hours asks how many cars the garage can work
  on at once and the most jobs in a day.
- **Customers see it**: the slot picker greys out holidays like weekly off
  days and says when a day is fully booked ("All times on this day are booked.
  Pick another day.") or the garage is paused; the garage page says "Closed
  today" on a holiday and "Not taking bookings right now" in place of Book
  Now while paused.
- **Admin vendor page** shows the real per-day hours, the paused state and
  upcoming holidays, and can pause or resume a garage.
- **Rescheduling** offers the times around the booking being moved (its own
  bay no longer counts against it), and a paused garage's reschedule sheet
  says the booking stays as it is or can be cancelled.
- **Garage portal**: the pause reason sits above the switch and can be updated
  while paused; Home's banners open Settings on the right tab; turning
  doorstep on without a radius asks for one next to the switch; Settings still
  loads if holidays can't be read.

- **Pilot numbers** on the admin landing page (Vendors): checkouts started,
  paid, accepted, completed and the rates between them; revenue; paid with no
  booking (refunds to do); cancellations by whose call; no-shows; the top five
  garages by paid bookings — for the last 7 or 30 days. Below the page title
  and Add vendor, with a full-size 7 / 30 day switch. Time from payment to
  the garage accepting is not shown: bookings do not record when they were
  accepted yet.
- **Crash screens** in all three apps (`error.tsx`, `global-error.tsx`,
  `not-found.tsx`): a plain message, Try again, a way home, and in the
  customer app Call / WhatsApp for support. They report to Sentry when it is
  on.
- **Crash reporting with Sentry** (`@sentry/nextjs`), off unless
  `NEXT_PUBLIC_SENTRY_DSN` is set for the build. No traces, no user details,
  cookies, headers or bodies, and phone numbers and 6-digit codes scrubbed from
  everything sent. No auth token or source-map upload: builds never call
  Sentry. Setup in `apps/*/lib/monitoring.ts` and `instrumentation*.ts`;
  shared settings in `@repo/core/monitoring`.

- **Admin bookings.** Search by reference, phone or name; filter by status,
  garage and dates; refreshes every 30 seconds; a "Waiting" badge on pending
  bookings, amber from 30 minutes; tap-to-call for the garage and customer;
  copy the Razorpay payment id; export the rows on screen as CSV. Each booking
  opens a detail page with a timeline, Cancel booking (on behalf of the
  customer, the garage or Detlio, with a reason), Mark no-show (after the
  start time, with what it means for the money), and internal notes.

### Changed

- **Garage onboarding** asks "How do customers get serviced?" — at the
  garage, or also at the customer's up to a distance (1–30 km) — instead of
  a pickup question that switched doorstep on with no distance.
- **Home's Reject** on an incoming booking asks "Reject this booking?" first,
  like the Bookings page.
- **Admin delete** of a garage with bookings shows the server's "Archive it
  instead" message rather than a generic failure.

- **No double payments.** Once Razorpay reports a payment, checkout and the
  booking page's Pay Now switch to "Payment received — confirming your
  booking…" and never offer Pay for it again. A confirm lost to the network
  or a server error is retried (after 1, 3 and 6 seconds); after that the page
  watches for up to a minute for the booking the Razorpay webhook writes. If
  it still cannot say, it shows the payment id with WhatsApp and My bookings
  instead of a Pay button; if the payment could not become a booking, the
  refund message. The waiting state is graphite with a spinner, not a red
  button; each step is announced to screen readers and focus moves to the
  panel. The WhatsApp message fits the case (missing booking, booking not yet
  shown as paid, or refund), and the Pay Now page drops the panel once the
  booking shows as paid. Rules in `@repo/core/payment-confirmation`,
  unit-tested.
- **Login code screen.** Counts down to the code's real expiry from the
  server (3 minutes; it showed 5), then says "Code expired — resend". Resend
  opens after 30 seconds instead of only after expiry. When the server says to
  wait, the login and verify screens count down to the moment on the Send /
  Resend button, and the amber message is said once rather than re-read to
  screen readers every second; when the SMS
  provider fails, the customer is told to try again in a minute or WhatsApp
  support. A refused send no longer falls through to the sign-up path (which
  answered a rate limit with "already registered").
- **Garages that fail to load** on home and search now say "Couldn't load
  garages. Check your connection." with Retry, instead of "No garages found
  nearby". The garage page says "Couldn't load this garage. Check your
  connection." with Retry instead of "Loading…" for ever, and says when a
  garage is not listed.
- **Admin loads Space Grotesk**, so `font-numeric` figures there use the
  brand's numeric face instead of falling back to Inter.

- **Booking timing rules.** Slots need an hour's notice at the garage and 3 for
  doorstep: the picker says so, drops times that run out while it is open, and
  explains an empty evening ("No times left on this day…") instead of calling
  it too long for the day. Checkout sends the booking type with the slot
  request and, if a time lapses before Pay, clears it and returns to the slot
  step.
- **Cancelling and rescheduling.** A booking the garage has not accepted can be
  cancelled any time. Once accepted, cancel and reschedule close 2 hours before
  the slot, and the booking page now shows that instead of offering a control
  the server refuses. A reschedule goes back to Requested until the garage
  accepts the new time, and the copy says so.
- **Garage portal.** A pending job whose time has passed shows Decline only,
  with why; a moved job says the customer chose a new time; refused actions
  show the server's message and refresh the list.
- **Cancellations by Detlio and no-shows.** The customer's booking page says
  "Cancelled by Detlio" (and at whose request), or explains a no-show: a
  customer no-show isn't refunded, a garage no-show is. The garage's cancelled
  tab names both. Checkout's cancellation policy and the FAQ now say that a
  missed accepted booking isn't refunded.

## [0.3.0] — 2026-08-28

Location, a map, and one tab component instead of six.

### Added

- **Location-aware browsing.** A persisted `location-store` with a resolution
  ladder (explicit choice → live GPS → saved address → last known → city
  default). Coordinates are rounded to ~110 m before they leave the device —
  finer than any sort needs, and enough to keep the server's geocode cache warm.
  Nothing here ever blocks the list: a declined prompt costs distances, not
  results.
- **A permission drawer that explains before the browser asks.** The browser's
  prompt gives no reason and offers no second chance — a denial is sticky — so
  the cost of asking cold is losing distance sorting for that person more or
  less permanently. Three concrete reasons, "Not now" with a seven-day cooldown,
  and a separate state for when the browser has already blocked it, where a
  button that silently does nothing would be a lie.
- **Real distances on garage cards**, and a "Nearest First" sort that is disabled
  with a reason rather than hidden when location is unknown.
- **A map picker for garage locations** — search, then drag the pin, then
  reverse-geocode it. Search-only and GPS-only both fail *silently*: small
  garages are absent from every POI dataset, and owners often onboard from home.
  A garage coordinate is entered once and then poisons every distance sort
  forever if it is wrong, so it is worth showing on a map. Wired into vendor
  onboarding, vendor settings, and both admin vendor forms.
- **Airbnb-style map browse** at `/map` — the map is the filter. Panning changes
  the query via a bounding box, markers are price pills, and the marker and card
  strip drive each other: tapping a pin brings its card up, swiping the cards
  moves the map. Re-searching is an explicit button, not automatic; auto-search
  reshuffles results under a thumb that was only looking around.
- **Infinite scroll** on the home feed and search, on a shared
  `useVendorSearch` hook (TanStack `useInfiniteQuery`) now backing all three
  listing surfaces. Search text is debounced — it was issuing a paged query per
  keystroke.
- **Paste a Google Maps link, or raw coordinates, to place a pin.** Business-name
  search finds only about a third of small garages, but owners can already find
  their own garage on Google — this lets them hand that over instead. Raw
  `13.0043, 80.2554` is parsed client-side, with no link to expand and no
  geocoder to get it wrong.
- **Warnings, not validation, on pasted links.** A place-share link, a directions
  link, or one that resolves to a different city than the form says all place the
  pin anyway and explain what happened. The pin stays the source of truth and is
  visible on the map, so being told beats being blocked. The city check earns its
  keep: one vendor's link points to Rajapalayam, ~450 km from the Chennai address
  on their record, which nothing else would have caught.
- **Vendor coverage-area editor**, for garages whose travel area a plain radius
  gets wrong.
- **Admin coverage map** showing where doorstep demand exists with no garage
  nearby.
- **Driving time** on the garage page, degrading silently to the straight-line
  distance when unavailable.
- Basemap tiles from OpenFreeMap — no key, no registration, no request limit —
  behind an env var so switching to MapTiler or Carto is config, not code.

### Changed

- **One tab language, not two.** Six hand-rolled copies of tab markup across five
  files rendered in two different looks. Now `ScSegmented` for switches that
  filter one visible list (bookings, earnings, At Garage/Doorstep) and
  `components/ui/tabs` for real panels (vendor settings, admin vendor forms).
  The split is not pedantry: Radix tabs advertise `aria-controls` for a panel
  that will appear, which the filters do not have, so those are a `radiogroup`
  with arrow-key navigation.
- The selected tab carries the brand colour as an **accent** — a red hairline and
  label on a raised surface — rather than a solid fill, which at four tabs
  competes with the red active item in the bottom nav directly below it.
- **Vendor settings and both admin vendor forms are tabbed**, four panels each,
  instead of one long scroll.
- Sorting and filtering moved to the server; `lib/sort-vendors.ts` is gone.
- Customer addresses and vendor onboarding no longer submit a hardcoded Chennai
  coordinate for every row.

### Fixed

- **The address dropdown reopened after picking a suggestion.** Selecting one
  writes its label into the input, which is indistinguishable from typing, so the
  debounced search fired for the chosen text and repopulated the list over a
  location already settled on. It also now dismisses on an outside tap or
  Escape — it floats over the map, so reaching past it to drop a pin landed on a
  suggestion instead.
- **Picking a suggestion left city and pincode blank.** Autocomplete predictions
  carry no address components; the picker now asks the point, which is the same
  cached call a pin drop already makes.
- **"Search this area" was unclickable.** It sits inside the
  `pointer-events-none` map chrome and was missing `pointer-events-auto`, so
  every tap fell through to the map.
- **"Use my current location" did not move the map.** Updating the location store
  feeds the distance sort, but the map's centre is a construction option MapLibre
  reads once. It now flies there and re-queries, so you do not land somewhere new
  still looking at the previous area's garages.
- **A slow basemap froze the whole map screen.** Bounds reporting was gated on
  mapcn's `isLoaded`, which waits for the *style* to download from a
  donation-funded host with no SLA — leaving "Looking in this area…" forever with
  working data one call away. `getBounds()` needs no network, so results now load
  even when the basemap does not.
- **The map left a dead strip along one edge.** MapLibre sizes its canvas once
  and only re-measures on *window* resize; a `ResizeObserver` now keeps it
  matched to its container.
- **A confirmed pin could never be un-stuck.** `geoConfirmedAt` was only ever
  written when a vendor was *verified*, and verification cannot run twice — so
  every already-verified garage read "Unconfirmed pin" forever with no way to
  change it. Admins can now confirm a pin explicitly, and moving one confirms it
  implicitly. Re-saving unchanged coordinates deliberately does not, so editing a
  phone number cannot silently assert the location was checked.
- **The result card's top ring was shaved off.** Setting `overflow-x` to anything
  but `visible` makes the computed `overflow-y` `auto` too, so the scroll strip
  clipped vertically — and a `ring`/`shadow` paints outside the border box.
- **Maps rendered in the wrong theme.** mapcn falls back to `prefers-color-scheme`
  when given no `theme`, so a light-mode OS got a near-white basemap inside this
  permanently dark app. Every map now pins the app's theme explicitly.
- mapcn and shadcn ship styles against `bg-background`, `text-muted-foreground`
  and friends, none of which this theme defines — both were remapped to the app's
  own tokens rather than adding alias tokens and keeping two vocabularies.

## [0.2.0] — 2026-08-27

### Added

- **Promo codes at checkout.** Coupon entry in a sheet, a payment summary that
  spells out the line item, the discount and the amount to pay, and the discount
  on the booking receipt and bookings list.
- **Admin Discounts section** — list, create, edit, activate/deactivate and
  delete, with search and lifecycle filters (active / scheduled / expired /
  inactive), usage counts, and a guard rail nudging for usage limits on deep
  discounts. Delete is hidden once a code has been redeemed, mirroring the API.
- **Add a car without leaving checkout**, via a sheet. The previous flow linked
  out to the profile screen, which discarded the in-progress booking — the date,
  time and any applied code are page state and did not survive the trip.
- **TanStack Query**, with a per-session client, no retries on 4xx, and
  hierarchical query keys. Used by the discount screens and the slot picker; the
  rest of the app still uses the Zustand stores.
- Skeletons for the date row and time grid while slots load.
- A cancellation policy note under the order summary, stating what the API
  actually enforces: a two-hour cutoff and at most two reschedules.
- This changelog, and the version console log described above.

### Changed

- **Checkout is a sequence, not a wall.** Date → time → car → summary, each step
  appearing once the previous one is answered. The price moved below the car
  picker, because for a per-vehicle service the car *is* the price.
- Every overlay is a bottom sheet. Service details was a centred dialog; the
  slot picker's calendar was a hand-rolled centred box with no Escape handling,
  scroll lock or animation.
- Vendor earnings read the server-computed `vendorPayoutAmount` rather than the
  charged amount, so a platform-funded discount doesn't silently dock the garage.
- The booking page's top bar is sticky.
- A car is auto-selected only when the customer has exactly one, so the summary
  step isn't skipped for customers who have a choice to make.

### Fixed

- The slot picker flashed "No slots available on this date" before its request
  resolved — an empty-by-default array rendered as a definitive answer. Loading
  is a real state now.
- The booking page's bottom padding cleared the fixed Pay bar by less than the
  bar's height, so the order summary was permanently clipped and unreachable.

## [0.1.0] — 2026-08-18

- Customer app: search and filtering, garage pages, booking with online
  prepayment, booking history, and a profile with cars and addresses.
- Vendor panel: onboarding, services, packages, per-service images, photos,
  earnings and reviews.
- Admin panel: vendor CRUD, verification, archiving, service and media
  management, and a bookings view.
- Rescheduling from the booking detail screen (2026-08-10).
- A shared `sc` design system across all three panels (2026-08-13).
- Fixed: signed-out admins redirect to login, and dynamic `/vendors/:id/edit`
  rewrites correctly on the admin subdomain (2026-08-09).
