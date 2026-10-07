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

- **Admin bookings.** Search by reference, phone or name; filter by status,
  garage and dates; refreshes every 30 seconds; a "Waiting" badge on pending
  bookings, amber from 30 minutes; tap-to-call for the garage and customer;
  copy the Razorpay payment id; export the rows on screen as CSV. Each booking
  opens a detail page with a timeline, Cancel booking (on behalf of the
  customer, the garage or Detlio, with a reason), Mark no-show (after the
  start time, with what it means for the money), and internal notes.

### Changed

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
