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

_Nothing yet._

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
