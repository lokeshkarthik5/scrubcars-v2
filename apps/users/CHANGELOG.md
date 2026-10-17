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

- The red button's shine now finishes within 5 seconds (two 1.3 s sweeps, 0.4 s in; the animation ends at 4.8 s), inside WCAG 2.2.2's limit for moving content.

### Added

- **Booking funnel analytics, first-party.** The customer app records a
  few steps of each visit (app opened, Home, the garage list, a search's
  category and length, the map, a garage's page, a service added, checkout
  started, a slot or address picked, Pay pressed, a review or complaint
  sent, Help or Contact opened) through `@repo/core/analytics`: batched,
  sent to our own API with `navigator.sendBeacon` every few seconds and
  when the page is hidden, a random visit id in sessionStorage, nothing at
  all with Do Not Track or Global Privacy Control, never throwing. On in
  the Production build only (`NEXT_PUBLIC_ANALYTICS`, set by
  `next.config.ts` from `VERCEL_ENV`). No personal data, no search text,
  no cookies. Admin's Statistics gains a **Funnel** tab (last 7, 30 or 90
  days; all booking types or one): the steps from a visit to a paid
  booking with each step's conversion and the biggest drop highlighted,
  returning customers within 30 and 60 days and new against repeat
  bookings per week (from bookings), garages by views against bookings,
  categories browsed and devices, with a note while the period reaches
  back before the first event. Start pilot clean gains a "Usage events"
  row with its own tick, and the CSV a line for it. The privacy policy's
  reviewer notes describe what is collected; its public text is unchanged.

- **Earnings and Payouts.** Garage portal: Earnings now opens on "Due now"
  (or "You owe Detlio") and "Paid this month", lists each booking that
  earned money in the chosen dates (30 days, this month, last month or two
  dates) with its price, Detlio's or the garage's promo, refunds, Detlio's
  commission ("8% · ₹40", or "Free — booking 12 of your first 25"), the
  garage's share, cash it collected, and Due or Paid with the payout's
  reference, plus the payouts made, and downloads it as CSV. Owners only,
  as before. Admin: a Payouts page (header nav, and from Refunds on a
  phone) lists every garage owed money, oldest first, flagged past 24
  hours, with a CSV; each garage's page shows where to pay (copyable), the
  bookings due, Record payout (the amount is what is due; UTR or UPI id,
  time, note, your name) and the payout history, with statement and
  payout CSVs. The garage edit page gains Payout details (account name,
  number, IFSC, UPI id), saved on their own. Start pilot clean's counts
  can say "N garage payouts". The CSV helpers moved to `@repo/core/csv`.

- **Refund now in admin.** Each row on Refunds owed (and a booking's Refund
  section) has "Refund now…" beside "Mark refunded…" when there is a
  Razorpay payment to refund. Its sheet shows the customer, the booking or
  checkout, what is owed and the payment, takes an amount (everything owed
  to start with, can be lowered, never above it) and says "Refunds take 5–7
  working days to reach the customer." The refund goes through Razorpay and
  the row moves to Done. Mark refunded stays for refunds done in the
  dashboard. Customer app: while such a refund is on its way, the booking
  page says "Refund of ₹X started on <date>. It reaches your account in 5–7
  working days."

- **Pickup & drop, part 1 of 2 (garage portal and admin).** Garage
  portal: Settings → Hours has a Pickup & drop switch; turning it on asks
  for the distance (empty is 10 km from the pin) and the owner's tick "We
  are responsible for the customer's car from pickup until it is
  returned", and then says "Pickup within 8 km" with the date it was
  accepted. A pickup job card has a "Pickup & drop" badge, the address to
  collect from and return to with Open in Maps and the customer's phone,
  and one button for the step it waits for: Picked up (with the customer's
  4-digit pickup code) → At garage → Mark in progress → Out for delivery →
  Delivered (with the delivery code), with the tries left after a wrong
  code and Detlio's number once locked. Before photos are suggested at
  pickup. Admin: a Pickup & drop card on Add vendor and on the edit page
  (saves on its own; turning it on needs "The garage has agreed to this
  (signed agreement)"); the garage card's line says "Pickup & drop"; the
  checklist warns about pickup with no pin or no agreement. Bookings show
  the type everywhere ("Pickup & drop"), the pickup address, the latest
  handover step on the list, every step in the timeline, and "Confirm
  picked up…" / "Confirm delivered…" for a customer who cannot give the
  code. Customer app: no visible change yet; the type is labelled
  everywhere it could appear.

- **Complaints with a number and a 24-hour clock.** Customer app: a
  booking's Help sheet ends with "Make a complaint · Raise a complaint",
  which opens a short sheet (what it is about, as chips; what happened;
  Submit) with the booking and garage attached; the Contact page has the
  same entry for complaints not about a booking (signed out, a "Sign in to
  raise a complaint" link beside the phone, WhatsApp and email). Once sent:
  "Complaint C-000123 received — we'll get back to you within 24 hours."
  Profile has My complaints: number, status (Received, Being looked into,
  Resolved, Closed), date, what it was about, their words, and "Our answer"
  once resolved. The legal pages' 24 hours and 7 days now come from
  `@repo/core/complaints`, the clock's own numbers. Admin: a Complaints tab
  (header and phone bar) with Open · Overdue · Resolved · All chips and
  counts, overdue cards in amber with which promise was missed, and a
  detail page with the customer, booking link, garage, their words, the
  two due times, Acknowledge, Resolve (with the note the customer reads),
  Close (optionally saying why) and an internal note. Start pilot clean
  lists a cutoff run's complaints as one ticked row, and its CSV says what
  happened to them.
- **Admin: the garage Bin.** The garage list's chips end with Bin (n);
  garages in the Bin are in no other chip or count ("Bin = off the app.
  Restore it, or delete it forever."). A card's ⋯ holds Archive and Move to
  Bin (the trash button is gone). Move to bin opens a sheet that says what
  happens (off the app for customers and its team; upcoming bookings
  cancelled by Detlio, paid ones owed on Refunds; everything else kept),
  lists the bookings it will cancel and which are paid, and takes an
  optional reason and your name. A Bin card shows when it was binned, by
  whom and why, "N bookings will be deleted with it" in amber, and Restore
  and Delete forever. Delete forever is a sheet listing what goes (bookings;
  logo, photos and service pictures; services, prices, hours and team
  logins) and what is kept for the accounts (payments, refunds and receipt
  numbers, real money only), with your name and the garage's name typed out
  before its red-outlined button wakes. A binned garage's edit page opens
  read-only with a banner and Restore. The Bookings garage filter leaves the
  Bin out.
- **Admin: garage list filters with counts, and a "what's missing"
  checklist per garage.** The list (now titled Garages, "Add garage") has one
  row of chips that scrolls sideways on a phone: All · Live · Active ·
  Pending · Suspended · Archived, each with its count, counted over the full
  list (All is every garage, so the stages add up to it). It opens on Live;
  the chip is kept in `?show=`, so Back from a garage returns to it. Two
  short lines under the chips say what the chosen one means ("Live =
  customers can find it", "Active = approved by Detlio, even if paused";
  Pending, Suspended and Archived have their own). Live is the server's
  `live` flag, the customer lists' own rule. Each card is calmer: the name,
  "Has N bookings" (or "No bookings yet") quietly beside it — or, for a
  garage customers can't find, why not ("Pending", "Not verified",
  "Paused") — the city and how it books ("At the garage · Doorstep 8 km",
  "Doorstep only · 10 km default"), and one readiness line: "Ready" with a
  quiet tick, "Ready · 2 optional: logo, photos" in grey, or "1 blocking ·
  2 to fix" ("1 to fix: map pin" when nothing blocks) in amber. Tapping the
  line opens the checklist grouped Blocking / Fix / Optional; each row
  opens the edit page on the tab where it is fixed
  (`/vendors/<id>/edit?tab=services&back=/vendors?show=pending`), as do
  Edit and "Set location before verifying" (on Location). The Owner,
  Location and Services cells are gone from the card; Verify, Edit,
  Archive/Restore and Delete are unchanged. After any change on the edit
  page (Save changes, the pin, logo and photos, pause, Hide / Show again,
  How customers book) and after Verify, Archive and Restore, the garage list
  is marked stale, so Back shows it as it is now. Add garage returns to All,
  where the new garage is first. `FilterChip` takes an optional `count`
  (named "Live 12"). Rules in `apps/admin/lib/vendor-list.ts`, unit-tested.
- **Admin: easier garage editing.** On the edit page, a "How customers book"
  card sits above the tabs: At the garage / Doorstep / Both, with a one-line
  hint, saved the moment it is tapped (a quiet "Saved" tick; arrow keys wait
  for the last pick, so passing over Doorstep never switches drop-in off),
  "Travels up to [ ] km" (1–30, decimals allowed as in the garage app;
  optional: "Empty means 10 km.", true once #42 is in, so this merges after
  it) saved when the box is left, and a line saying what customers can book
  ("At the garage · Doorstep within 8 km", "…within 10 km (default)", or
  "Doorstep within the area the garage drew" when the garage drew one, which
  the radius then doesn't touch), with an amber note when the garage isn't
  live yet (not Active and verified), when bookings are paused or when
  nothing is switched on. With nothing picked, the choice can still be
  reached with Tab (`ScSegmented` gives the first option the tab stop, so
  every segmented control does the same). The Drop-in and Doorstep
  checkboxes and the doorstep radius are gone from Operations and from Save
  changes, so nothing is saved twice; "Pickup & drop" stays there, marked
  optional. Add vendor has the same card as an ordinary field, sent with
  Create. Save changes is now a bar along
  the bottom while something is unsaved ("Unsaved changes in Operations and
  Services", Discard, the one red Save changes, off with the reason when a
  field or a service row is not ready, e.g. "1 service needs a price
  (Services)"); a dot marks each changed tab (amber where the problem is);
  leaving with changes asks first — a reload, closing the tab, the panel's
  links, and Back (the browser's button, Android's back, the iPhone's edge
  swipe); saving stays on the garage with a "Saved" toast, so new services
  can take photos straight away. If the reload after a save fails, Save waits
  ("Saved. Reload the page to keep editing.") rather than add new services a
  second time. Discard also puts the map's pin back. `?tab=` opens a tab
  and is kept in the address as tabs change; `?back=` sets the back arrow
  (garage-list paths only). The services editor, shared by both pages, is one
  compact row per service, grouped "Wash and standard" and "Detailing": name,
  a duration pill (30/45/60/90/120 min or Other…), Hatch/Sedan/SUV prices, or
  one price for "Same for all cars" and the fee for "After inspection"; the ⋯
  opens description, category, pricing, "Photos and video" and Hide service. New rows are
  priced by car type. A category change that moves a row to the other group
  follows it there and says so. "Add from template" offers ten ready-made
  services the garage doesn't have yet (Foam wash, Body wash, Full wash,
  Interior cleaning, Ceramic coating, Polishing, Engine bay cleaning,
  Underbody wash, Headlight restoration, Bike wash;
  `@repo/core/service-templates`), filled in but for
  the prices, which the row then asks for; Interior cleaning sits with the
  washes, as in the mockup. With an OpenAI key set on the API, "Write with
  AI" in a row's description ("Rewrite with AI" over existing text, with an
  Undo) and "Fill all empty descriptions" (one row at a time, with progress,
  stopping at the first error) draft the text; it is saved with Save changes
  like typed text, and Save and Discard wait while it is being written.
  Opening another tab stops it, and what had not arrived is dropped.
  Packages are still the garage app's to edit.
- **Admin: hidden services can be shown again.** The garage editor's
  Services tab has a collapsed "Hidden services (N)" list — each with its
  name, its price ("₹600–₹900 by car size · no SUV price" names a size with
  no price) and Show again, which puts it back on the garage page and in the
  editor straight away. A saved service's Remove is now Hide, which asks
  first ("Customers won't see it; you can show it again from Hidden
  services.") and also saves straight away; a service inside a package says
  it can't be hidden and why, on its row. A card never saved still has
  Remove. Hidden is never deleted. A hidden service with a car size unpriced
  says so before Show again ("SUV customers can't book this until it has an
  SUV price."); once shown, its row is scrolled to and focus lands on the
  missing price. Hide and Show again say what they did in a status line and
  move focus to where the service went (the Hidden services toggle, or the
  restored row). Save changes waits while a Hide or Show again is saving, and
  they wait for a save, so a save can't carry a list from before the switch.
  A garage with every service hidden says so instead of "No services added
  yet." and opens the hidden list. Admin runs `bun test` now
  (`apps/admin/lib/service-rows.test.ts`, `vendor-delete.test.ts`).

- **Service photos and videos.** On the garage page each service card has a
  64px picture: the video's poster with its length ("▶ 0:45"), else the
  first photo, else a drawn sample tagged "Sample". The details sheet opens
  with the video (poster first, plays only on tap, no autoplay; HLS, with
  hls.js loaded on the first Play where the browser needs it; progress,
  pause, sound and full screen) or the first photo at 16:9, then the photos;
  tapping a photo opens it full screen (swipe, "2 / 4", the garage and the
  service). The garage's own media are tagged "From <garage>", AI pictures
  and the drawn samples "Sample image" ("No photos from this garage yet").
  The description is held to two lines with "More".
- **Garage app: "Photos and video"** on every service and package, replacing
  the old image row: the privacy tick first ("Before adding: no number plates
  or faces can be read, or the owner agreed"), three photo slots and one video
  slot ("up to 60 sec", checked on the phone before uploading), the upload's
  progress, "Processing…", Ready with Replace / Remove, or a plain error.
- **Admin: the same block** in each saved service's ⋯ in the garage
  editor's compact services editor (`components/service-media-panel.tsx`),
  in place of its old photo row, so a service's photos and video are in one
  place, plus "Make a picture with AI": describe it, pick one of
  two ("Generate again · ₹8"), "Use this picture".

- **Admin: Statistics** (`/statistics`, a sixth tab in the menu and the phone's
  bottom bar). Filters in one row: Last 7 / 30 / 90 days, This month, Last
  month (Last 30 days by default), every garage or one, and on Overview
  "Compare with previous 30 days" (on by default). Overview: six tiles with
  how each moved (Bookings, Collected after refunds, Detlio commission,
  Average booking, Checkout → paid, Cancellations; amber when it moved the
  wrong way, grey for commission and cancellations while the period runs to
  today, as its latest jobs have not played out), "Bookings per day" against
  the period before and "Collected per week" (part weeks dimmer; past seven
  bars only the first, last and highest carry an amount), then the Pilot
  numbers card, moved here from Vendors, with its "Revenue" now "Collected,
  less refunds owed" and a line saying it covers every garage over its own 7
  or 30 days, not the filters. Breakdown: the funnel with where people
  dropped off (paid bookings not yet marked done are "not marked done yet",
  not "upcoming"), garages by money collected (top 5, "Show all"), service
  types, busiest hours by slot, and "Download CSV". Commission: the rule in
  plain words (reporting only: payouts are unchanged), the month's
  commission, and garages "Commission active" or in their free period ("18
  of 25 free bookings used"). A "too long" timeout is shown at once, never
  retried. Each tab ends with "How we count". Charts are recharts 3.10.1
  (admin only, loaded with the first chart), each with a text summary for
  screen readers.
- **Admin: Start pilot clean** (`/data-reset`), shown in the menu (and linked
  from Bookings on a phone) only while the API has `ADMIN_DATA_RESET` on.
  Three steps: Scope (everything before a cutoff in India time, or only
  bookings marked Test, as a list with a box per booking; real money is
  greyed out with "Real payment — kept"), Dry run (the counts in plain words,
  the receipt plan, and a required "Download list (CSV)"), Confirm (your
  name, "I have a database backup from today", the typed phrase, and the one
  red button), then what was done. Old payments are checked with Razorpay
  as the dry run pages through them. A tap anywhere on a row ticks it; "Load
  again" keeps what was unticked; "Tick all" stops at what one run deletes
  and says how many wait; the CSV lists every row in scope, deleted, kept or
  unticked. Back and closing the dialog are held while the delete runs.
- **Admin: the "Test" mark on a booking.** A "Mark as test" switch on the
  booking page, a "Test" badge and a "Test bookings" filter on the list, and
  a "Test-mode payment" badge where the payment's mode is recorded. While the
  reset is on, a marked booking's page offers "Delete test booking…", the
  same dry run and confirmation for that booking alone.

- **The new Home hub and Updates (behind `NEXT_PUBLIC_HOME_HUB`).** With the
  flag `on`, `/home` is the hub (`components/home/`); with it off, as in
  production until the owner signs off a preview on live data, `/home` is the
  garage list exactly as before. One read, `GET /users/me/home` (TanStack
  Query, 30 s fresh, refetched on focus, `@repo/core/api/hooks/use-home`),
  top to bottom: "Hey 👋" and the first name (the first word longer than one
  letter not ending in "." — "R. Karthik" is Karthik), the avatar initial and
  a bell whose red dot is also in its name ("Updates, new"); one must-act
  card when one applies (a final bill to pay, with Pay ₹X as the screen's one
  red button and Book a wash outlined; or the garage shut on a booking's day,
  with Change time only while the booking can still be moved and the garage
  is not paused, and Get help); the offers, up to three V2 coupons
  (`@repo/ui/home/offer-coupon`) in a swipeable carousel with ×; "Rate your
  wash" below them only when nothing is must-act (a star opens the booking's
  own rating form with that many chosen, × hides it for good); the car hero
  (several cars swipe with dots and the tiles follow, pencil to the profile's
  cars, `carImageFor` gives every type the approved cut-out for now, "Add
  your car" with no car) and the red Book a wash with its intro shine (two
  sweeps, then still; none under reduced motion); the wash tile (one step a
  day up to 14, then one per two or three days so a 21- or 30-day bar stays
  readable, "8 days ago", due/overdue/booked from the server, a tap picks 7, 10,
  14, 21 or 30 days); the tile beside it (Next booking with a team notice
  about it as one line, "Pay to hold your slot" for an unpaid booking,
  Before & after, Book again priced for the car and preselecting that car at
  checkout, "Pick a service" when the garage no longer sells the last job's,
  or nothing booked); Updates (the pinned notice, the newest two rows, See
  all); nearby garages (the location prompt only when no location was sent;
  hidden when the count failed); the car-care tip, last, hidden until
  tomorrow on this phone. The floating pill
  nav (Home, Map, +, Bookings, Profile), app-wide (next entry); + opens
  `/garages`. A signed-out visitor on the hub goes to `/garages`; the
  `?welcome=1` toast stays. A change of location keeps the Home on screen
  while the new one loads. The booking page reads Home's `?then=` and
  `?rate=` once and takes them off the URL, so Back or a reload does not
  reopen a sheet.
- **The hub's look on the rest of the app (behind `NEXT_PUBLIC_HOME_HUB`).**
  With the flag off nothing below is drawn and every screen is exactly as
  before (unit-tested: `components/customer-shell.test.tsx`,
  `components/main-action.test.tsx`).
  - **The floating pill nav on every customer screen with a nav** —
    Bookings and a booking, Profile, `/garages`, `/search`, Home — and on the
    map, which had none: Home, Map, the white + (New booking, to
    `/garages`), Bookings, Profile. The customer screens render
    `CustomerShell` (`components/customer-shell.tsx`), which hands AppShell
    the pill (`floatingNav`, new in `@repo/ui`) and pads the page by
    `FLOATING_NAV_CLEARANCE` (112pt plus the home indicator) so the last
    control scrolls clear of it; the pill's scrim fades content out beneath
    it (not on the map, where it would only hide streets, and the map's
    cards sit above the pill). Vendor and admin bars are untouched. Each item
    is a 44pt target with `aria-current` when lit. Which one is lit is
    `lib/hub-nav.ts`: each tab on its own route and the screens under it (a
    booking lights Bookings). On `/garages`, the spec's "none or Home"
    depends on who is looking: nothing for a signed-in customer, whose Home is
    the hub (a lit Home there would point a screen reader at the wrong page),
    and Home for a visitor, whom `/home` sends to the list, so it is their
    Home and the tab they tapped lights. The + is an action and never lights.
    On `/search` nothing is lit (a step off the list, not a place of its own,
    owner decision D9). This settles the open question of `/garages` having
    no lit tab. The flat bar's `garagesUnderHome` switch is gone: with the hub
    on, customers never see that bar.
  - **The red hero pill on a screen's one main action**, with its two-sweep
    shine (none under reduced motion or while disabled): the garage page's
    Book Now, checkout's Pay ₹X (or Confirm booking) once nothing is left to
    pick — while a step is missing it stays graphite, so the shine plays
    when Pay first appears — a final bill's Pay ₹X on the booking page,
    Save car in the add-car sheet (`hero`, new on `AddCarSheet`) and Save
    address in checkout's add-address sheet, its sibling. One component,
    `components/main-action.tsx`: the hero pill with the ↗ when the flag is
    on, the old ScButton with the old classes when it is off. The shine plays
    once per visit (`useHeroShine`, new in `@repo/ui`, and
    `.cta-hero-rested`): Pay enabled again after a closed payment sheet,
    Save car once the form is valid again, or Pay coming back after a step
    was reopened does not sweep again. Secondary actions stay outlined, and
    the garage page's Add buttons are a graphite outline, so Book Now is the
    page's only red.
  - **The hub's large light titles** (34pt Inter 300, `HUB_TITLE_CLASS` and
    `TopBar large` in `@repo/ui`, which Updates now uses too) on Bookings and
    Profile. The map has no title; everything else keeps its own.
  - Tests: `lib/hub-nav.test.ts`, the two component tests above, and
    `cta.test.ts` now also pins the pill's white label, the shine's two
    finite sweeps, that it is off under reduced motion and when disabled,
    and that a spent shine stays spent. @p0 `specs/users/hub-look.spec.ts`:
    the pill on `/bookings`, a booking, `/profile` and `/map` with the right
    item lit and none on `/garages` and `/search` for a customer (Home for a
    visitor on `/garages`, `garages.spec.ts`), + to `/garages`, 44pt items,
    the page clearing the pill, the 34pt titles; exactly one hero on the
    garage page and at checkout (none before a service or a time is picked),
    the Add buttons not red, Save car and Save address, the shine not
    replaying when Save car is enabled again, off under reduced motion, and
    the final bill's Pay. The accessibility suite's brand-red debt check now
    opens a service's details first, since the Add buttons it measured are
    no longer red with the flag on.
- **`/updates`** (the bell): To do (bills, closed days, ratings), the team's
  pinned notice, then Today, This week and Earlier with unread dots, in IST
  whatever the phone's zone. Opening it moves the read marker to the server's
  own `now`, so the bell goes quiet; Mark all read takes the dots off. 404
  with the flag off; customers only.
- **Offers apply themselves at checkout.** Tapping an offer remembers the code
  and the car on screen (`@repo/core/stores/pending-checkout-store`: this
  account's only, for a day at most, never past the offer's end; cleared on a
  booking, on Remove and on sign-out). A garage's own offer opens its page
  with `?code=`, which the page passes on to checkout; a Detlio-wide one opens
  `/garages`. A customer with no car adds one first, in place. Checkout
  preselects the car picked on Home (if still saved), applies the code once
  the services and car are known, checks it again whenever either changes,
  and if it no longer applies says so on the coupon row in the server's words
  rather than dropping it quietly, with Remove beside the message. Remove is
  for good, off the link too. A code the server refuses for good (expired,
  used up, already used) is also forgotten on the device, so the next
  garage's checkout does not bring it back.
  Home, Updates and the bell are refreshed after a booking, a payment, a bill
  paid, a cancellation, a reschedule, a review and car changes on the profile.
- `ScButton` variant `hero` and the `hub-card` surface in `@repo/ui`
  (`globals.css`, with the card tokens and `--gradient-cta`); the gradient's
  stops are `CTA_GRADIENT` in `@repo/core/cta`, whose test checks white text
  clears 4.5:1 on the lightest stop (#E4002B) and that the stylesheet uses
  exactly those stops. Inter now loads its optical-size axis, so large titles
  wrap as in the approved mockups. The privacy draft lists the Updates read
  marker and the ×s (deleted with the account), the wash interval, and the
  two new local-storage keys (`legal-docs.test.ts` checks all three).
- Tests: `packages/core` `home-display.test.ts` (greeting, offer small print,
  wash line and bar, IST times and grouping), `pending-checkout-store.test.ts`,
  `car-images.test.ts`, `cta.test.ts`, `book-again.test.ts`
  (`bookAgainPathFor`). @p0 `specs/users/home.spec.ts` (offer first; offer to
  checkout with the code applied, re-checked after a change, gone after
  Remove; bill above the offer with Pay the one red button; Change time;
  wash due and overdue per car and the interval sheet; a new customer's Add
  your car; a booking notice on the tile and leading Updates; notice and
  offer ×s that hold; Book again; signed out to `/garages`; the welcome
  toast; a Home code that no longer fits the cart, said and removable) and
  `updates.spec.ts` (bell to Updates and back with no dot; Mark all read;
  Rate your wash ×), on three new seed customers of their own
  (`homeScreenWash`, `homeBell`, `homeTile`) beside home-api's. The flag is
  `on` in `apps/e2e/.env.e2e` and CI's build; `garages.spec.ts`,
  `homepage.spec.ts`, `auth.spec.ts`, `smoke.spec.ts` and the accessibility
  scan (now `/home` and `/updates` too, waiting for their data rather than
  the skeleton) follow.
- **The garage list at `/garages`.** The list that has been Home (mode
  switch, search, category chips, sort, the infinite list) now also lives at
  `/garages`, with its own title ("Garages · Detlio"), description and
  canonical URL. Nothing about it looks or works differently. `/home` renders
  the same component (`components/garages/garage-list-screen.tsx`), so the
  two cannot drift while the new Home is built; the Home tab stays lit on
  both, and tapping it on `/garages` stays on `/garages` (a lit tab links to
  the route that lit it), so a customer's mode, category and sort survive the
  tap as they did on `/home`. `/garages` names the site's share image in its
  own `openGraph` and `twitter` (with the large card): a page's own objects
  replace the root's, and the image files only attach at the root, so a
  shared `/garages` link would otherwise show no picture. `lib/home-hub.ts`
  adds `isHomeHubEnabled()`, true only when `NEXT_PUBLIC_HOME_HUB` is exactly
  `on`; nothing reads it yet, and it is off in production, in
  `apps/e2e/.env.e2e` and in CI's build (declared in `turbo.json` so a change
  rebuilds). Unit-tested in `lib/home-hub.test.ts`; the @p0 spec
  `specs/users/garages.spec.ts` checks a guest can browse `/garages` (share
  image and large card included), "Find another garage" opens it, the lit
  Home tab there keeps the customer on `/garages`, and `/home` still shows the
  same list with the flag off. The accessibility scan, the narrow-phone check
  and the smoke spec cover `/garages`.
- **Legal pages (drafts for legal review).** `/terms`, `/privacy`,
  `/refund-policy`, `/service-delivery` and `/contact`: public, statically
  rendered, readable at 390px (tables become stacked cards), printable black
  on white, each with its own title, description and canonical URL on
  detlio.com. The text is plain data in `lib/legal/<page>.ts`, rendered by
  `components/legal/legal-page.tsx`; the format and its helpers
  (placeholders, reviewer notes, Markdown export with lower-roman numbered
  lists, as on the page) are `lib/legal/doc-format.ts`, unit-tested — in this
  app until a second app (the Partner Terms) needs it. Every business detail (name, address,
  phone, email, grievance officer, support hours, courts, retention, the
  effective date) is in one file, `lib/legal/details.ts`; an unconfirmed one
  is `null` and prints as a visible "[to be confirmed: …]". Every booking
  figure the pages print (notice, the 2-hour cutoff, reschedules, days
  ahead, checkout lifetime, job-photo limits, the final-bill window, the
  refund wording, the receipt line) is imported from `@repo/core`; the ones
  the server enforces on its own (`MAX_RESCHEDULES`, `CHECKOUT_MINUTES`,
  `PHOTO_EDIT_WINDOW_DAYS`, new in core) are mirrors, commented on both
  sides. The refund policy quotes the booking page's owed-refund line from
  `customerRefundLine` itself, and a test checks every "section N"
  reference reaches the section it means. `LEGAL_DRAFT` (true for now)
  shows a "Draft for legal review — not yet in force" banner and sets robots
  noindex; reviewer notes render only under `next dev`, never in a build
  (they describe open product gaps), and are always in the Markdown export.
  Do not merge to main while `LEGAL_DRAFT` is true.
  `bun scripts/export-legal.ts <out.md>` writes all five pages, with every
  placeholder and reviewer note listed up front, as one Markdown file for the
  lawyer. The pages render for anyone, signed in or not, with no redirect
  (`AppProvider`'s new `document` route access).
- **Links to the legal pages.** The homepage footer has a Legal column with
  all five and "Detlio is a brand of ScrubCars, a sole proprietorship of
  <proprietor>, <address>" above the copyright (E-Commerce Rules rule 4(2)),
  from the same source as the pages; its support email now comes from
  `lib/legal/details.ts`. The sign-in screen reads "By continuing, you agree
  to our Terms. Our Privacy Policy explains how we use your data." with real
  links (they were plain text), opening in a new tab so the number typed is
  kept. Checkout says "By paying you agree to the
  Terms and the Cancellation & Refund Policy" under Pay, both opening in a new
  tab so the slot, car and promo picked are kept. Profile has a Legal group
  with the five links. The partner portal's sign-in links only the Privacy
  Policy, on detlio.com: the customer Terms are not a garage's agreement.
- **Tests.** `lib/legal/legal-docs.test.ts` (the app's first unit tests,
  `bun test`) checks the five pages as data; the @p0 e2e spec
  `specs/users/legal-pages.spec.ts` checks they load, carry the address and
  email, the draft banner and noindex, do not scroll sideways at 390px, and
  that the footer, sign-in, checkout and Profile links reach them, and that a
  production build renders no reviewer note. The partner-portal privacy link
  is checked in `specs/vendors/login.spec.ts`. The accessibility scan covers
  the five pages.

- **My bookings: Upcoming and Past.** Two tabs: Upcoming (requested,
  confirmed, in progress) soonest first, and Past (completed, cancelled,
  declined, no-shows) most recent first, both by the real start time. The
  tab is in the URL (`/bookings?tab=past`), so Back from a booking returns to
  it. The old half of a reschedule is in neither: the new booking carries the
  payment. Each tab says when it is empty ("No upcoming bookings" with Find
  garages; "No past bookings yet"), the list shows a placeholder until it has
  loaded instead of "No bookings yet", and a failed load says so with Retry.
  The cards, the Refunded badge and the struck price are as before. Which tab
  a status goes in is one exhaustive switch in `@repo/core/my-bookings`,
  unit-tested.
- **Book again.** A booking that is over has a "Book again" button on its
  page (secondary, not red) and a small "Book again" link on its card under
  Past. It opens checkout at the same garage with the same services, in the
  same order, and the same At garage / Doorstep choice; nothing else carries
  over. A service the garage has stopped offering is left out and checkout
  says "Some services are no longer offered"; if none are left, the garage
  page opens to pick from and says why on the page. If the garage no longer
  offers the old booking's mode (a doorstep job at a garage that has stopped
  travelling), checkout says so up top ("Doorstep isn't offered here now")
  rather than quietly booking the other. The card is no longer one big link:
  its own link is stretched over it, so Book again is not a link inside a
  link; its name starts "Book again", as on screen.
- **Search by service.** Search finds a garage by any service it sells, not
  just its name or area, and the card says which ("Offers Ceramic Coating")
  when the name did not match. The box is labelled "Search garages or
  services" for screen readers as well as in the placeholder.
- **App icon, manifest and share image.** A "D." monogram (the wordmark's
  white D and red period, on graphite) as the favicon, the app icon and the
  iPhone home-screen icon; a web app manifest (`/manifest.webmanifest`: Detlio, opens on
  `/home`, standalone, graphite, 192 and 512 icons plus a maskable one); and
  a 1200×630 share image (the wordmark over "Care without compromise.") for
  WhatsApp and other link previews, with `metadataBase` set to detlio.com so
  its URL is absolute. The homepage's share image is now this one rather than
  the car photo.

- **Payment receipts.** A booking whose payment went through has a "View
  receipt" button on its page (secondary, not red). The receipt
  (`/bookings/[id]/receipt`) is a white, A4-friendly page that reads the same
  on a phone: the booking, the services and amounts, any discount, the
  Razorpay payment id, a paid final bill, refunds as minus lines, the net paid,
  and "This is a payment receipt, not a tax invoice." with the support number.
  Its number reads `DTL/26-27/000123` (consecutive within the financial
  year); the saved PDF is named "Detlio receipt DTL-26-27-000123", since a
  file name cannot hold a slash. "Download PDF" opens the print screen, with
  a line on how to save a PDF on Android and on iPhone, and an amber notice
  when an in-app browser opens no print screen. "Share" sends the page link
  (or copies it); the link only opens for the signed-in customer, which the
  page says. Printing shows only the receipt, black on white with A4 margins.
  If the receipt's number cannot be issued yet, the page says so in the
  server's words with a "Try again" button, rather than suggesting the
  receipt is not the customer's.
- **Refunds owed and done (admin).** A Refunds page (Owed / Done): each refund
  with the amount owed, how long it has been owed (amber after two days), the
  customer with tap-to-call, the Razorpay payment id with copy, and why; "Mark
  refunded…" records it with the Razorpay refund id (checked to start
  rfnd_), or as refunded outside Razorpay with how, the amount (all of it to
  start with; less for a part refund) and a note. A booking's page has the
  same in a Refund section, the bookings list flags "Refund owed ₹X" /
  "Refunded", the CSV gains both, and the pilot card shows refunds owed and
  refunded.
- **Refunds, for the customer.** A cancelled paid booking says "Our team will
  refund your payment to your original payment method within 5–7 working
  days", then "Refunded ₹X on <date>. It can take 5–7 working days to show in
  your account." once the team records it ("Refunded ₹X of ₹Y on <date>" for
  a part refund, with no promise about the rest). Never on the customer's own
  no-show. The bookings list tags a refunded booking "Refunded". A refund on a
  booking that is still on (a payment on a final bill the garage replaced)
  names the earlier final bill. A late payment's "Your payment will be
  refunded." reason is dropped beside the refund line, and the cancel
  confirmation now says the same 5–7 working days instead of "not automatic
  yet".
- **Admin refunds, smaller fixes.** Refunds is in the phone bottom nav. The
  "Mark refunded…" dialog follows the latest figures after a refusal and says
  when they moved; focus lands on the list after recording. The final bill
  section says owed / refunded / kept from the same refund rules instead of
  "Refund it in Razorpay". The no-show dialog says the garage is paid its share
  on a customer no-show and earns nothing on its own.
- **Garage earnings** list a customer no-show the garage is paid for, labelled
  "Customer no-show".


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

- **Admin garage forms never leave a service out of a save.** A service with
  a name but no complete price used to be dropped from the save without a
  word, and on the edit screen the server then hid it from customers. Now
  the row is marked in amber with what it needs ("Add the SUV price", "Add a
  name and the price") and Save changes (Create vendor on the add screen)
  stays off, saying why under the button on every tab ("2 services need a
  price — see the Services tab."), until each row is fixed or removed. Only
  an empty card that was never typed into is left out. Switching a row from
  Flat to Per vehicle fills the three sizes with the flat price; back to
  Flat takes the cheapest size. The rules are in `apps/admin/lib/service-rows.ts`.
- **Admin garages list: a refused action is shown on that garage's card.**
  A failed verify, archive or delete printed one line above the first card,
  so for an older garage (the list is newest first) a refused delete seemed
  to do nothing. The message now sits under the card's own buttons, is
  announced and is scrolled into view. A garage that has been booked says
  "Has N bookings" beside its delete button (the two wrap together, right-
  aligned). Pressing delete on it no longer asks to confirm a delete that
  would be refused: the card says why straight away, in words that fit its
  status — archive it if it is live, and no "archive it" loop if it already
  is (`apps/admin/lib/vendor-delete.ts`). A garage with no bookings gets a
  confirm about the delete alone.
- **Home's car is a picture of its body type.** `carImageFor` in
  `@repo/core/car-images` now gives a hatchback, a sedan and an SUV each its
  own picture (`public/cars/car-<type>-1200.webp` and `-2400.webp`); "SUV /
  MUV" is one tier, so MUV owners see the SUV. An unknown or missing type
  (and `constructor`) still gets the owner's own picture, `car-default.webp`,
  as does "Add your car". The three are free Pexels photos with badges,
  wheel logos and plates removed, recoloured and cut out to match; where each
  came from, its licence and the edits are in `public/cars/SOURCES.md`, which
  also says a brand or model name must never be shown with them. The sedan
  and SUV are side views; the hatchback, which the owner chose, is a front
  three-quarter view, mirrored to face the same way, with its front tyre on
  the shared line. The owner approved all three on 12 October 2026, and
  `CAR_PICTURES_BY_TYPE = false` in
  `packages/core/src/car-images.ts` puts the single picture back on every
  car, drawn exactly as before. The new pictures are a plain `<img>` with a
  1200/2400 `srcset` and a `sizes` that matches the hero (94% of the card,
  352px at most, so a phone fetches the 1200), with their width and height
  so nothing moves when they load. They share one canvas with the tyres on
  one line, and the hero places them by that line (`.car-hero__car--body-type`
  in `globals.css`), so every type, the taller SUV included, stands where the
  approved car stands (217pt down the hero, 201pt when short). A picture that
  fails to load falls back to the owner's, and then to an empty stage. Tests:
  `car-images.test.ts` (each tier, the srcset and sizes, the fallback for
  unknown types, the switch off, every file present); @p0 `home.spec.ts`
  reads the switch from `car-images.ts` and, with it on, checks the sedan and
  SUV files themselves are what loaded (not the fallback) and stand on the
  same line, measured inside the card's border; with it off, that both cars
  show the owner's picture. The six pictures and `SOURCES.md` are new files:
  commit the whole `public/cars/` folder with this change.
- **Privacy Policy draft: the Meta Pixel and matched offers.** Says what the
  Meta Pixel (`components/meta-pixel.tsx`, on every page through
  `app/layout.tsx`) does: Meta's code on every customer page, signed in or
  not, a page view on each page and each in-app navigation, sending the page
  address (which, on checkout, names the garage, the services picked, a
  doorstep visit and a code, and on a booking's pages its id and whether it
  was just paid, has a bill to pay or the star tapped on Home), the previous
  page, IP address, browser and device details and Meta's cookies to Meta
  Platforms, outside India, to measure and improve Detlio's ads; the `_fbp`
  and `_fbc` cookies in the storage table (`_fbc` after any Facebook or
  Instagram link carrying Meta's click ID, not only our ads); Meta in the
  data table, where data goes and retention. Every sentence that said Detlio
  uses no advertising or analytics trackers, or that nothing is used for
  marketing, is gone. New section 2 subsection "Offers on Home" lists what
  `HOME_OFFER_TARGETING` can match on (no bookings yet, booked that garage,
  near it by the location Home is sent, wash due or overdue from bookings and
  the car's interval, car size), that it only decides who sees an offer, that
  it starts only when this text takes effect (until then offers are not
  matched, though a car, a × or a used-up code still hides some), and that a
  customer can ask us for general offers only. The car, wash-interval,
  bookings and location rows say the same; the "Rate your wash" × is kept
  with its booking. Reviewer notes: consent before the pixel loads and Meta's
  role (processor or its own fiduciary); loading it only on public pages (not
  done here), with `?celebrate=1`, `?then=pay` and `?rate=N` as what it sends
  today; Meta's notice requirement, now met; Events Manager's automatic
  advanced matching; the lawful basis for matching; and that there is no
  per-customer opt-out yet. Terms section 16 and the privacy text say how
  Home orders offers, including that, once matching is on, Detlio's own codes
  come after booked and nearby garages' but before every other garage's
  (`offerTier`). Last updated 12 October 2026; `LEGAL_DRAFT` stays true.
  `legal-docs.test.ts` checks the pixel is still mounted and sends only page
  views as the policy says, that its cookies, every audience and the
  questions are declared, that the page address is spelled out (services,
  doorstep, just paid, rating), that both pages give the whole offer order,
  and that no page claims no tracking.
- **Links to the garage list open `/garages`.** The map's List, "Find
  another garage" on the garage page and checkout, the legal pages' "Book a
  service", and the homepage's "Book a service", "See all garages" and "Book
  on the web today". What still opens `/home`: the Home tab, signing in and
  profile setup (`?welcome=1`), the signed-in hint on the homepage, the app's
  `start_url` and the end of the welcome slides — those mean "the app",
  not "the list". `/search` is unchanged. The specs that looked at the list
  on `/home` (discovery, the stale-hint test, the failing-API test) now look
  at `/garages`.
- **Checkout** says "Not taking bookings right now" (with the garage's
  reason, in grey like the garage page's notice) at the top for a paused
  garage, instead of only once a date is picked, and "This garage isn't taking bookings on Detlio." for one that is
  no longer listed, instead of an empty page. A link whose services are all
  withdrawn no longer books the garage's first service in their place.
- **The garage page's favourite heart is gone.** It was not saved anywhere,
  so it reset on reload.

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
