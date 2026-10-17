# @repo/e2e

Playwright end-to-end tests for the three frontends and the API.

## Running

```bash
bun run e2e:up        # postgres + minio in docker
bun run test:e2e      # everything
bun run test:e2e:p0   # only the @p0 specs
```

The suite resets and reseeds the database itself, then starts the API and all
three frontends. Nothing else needs to be running first.

From `apps/e2e` you can also narrow the run:

```bash
bunx playwright test --project=users --headed
bunx playwright test specs/users/booking-coupons.spec.ts
bunx playwright test --ui
bunx playwright show-report
```

`E2E_SKIP_RESET=1` reuses the database between runs, which makes the
edit-and-rerun loop noticeably quicker. It is only safe for specs that do not
write — anything that cancels, reschedules or pays will see the previous run's
rows. It is ignored in CI.

On Apple Silicon, `export E2E_POSTGRES_IMAGE=imresamu/postgis:16-3.4` gets a
native arm64 build instead of running the official amd64 image under emulation.

## How it is put together

The database is disposable: `scripts/reset-db.ts` drops the schema, applies the
repo's own SQL migrations, and runs `apps/server/src/db/seeds/e2e.ts`. It
refuses to run against anything that is not a local `detlio_e2e`, because the
first thing it does is `DROP SCHEMA`.

Fixture ids are pinned in `apps/server/src/db/seeds/e2e-ids.ts` and re-exported
through `support/seed-ids.ts`, so a spec navigates straight to a known garage
rather than picking whatever the listing returned first.

**Every spec file owns a customer.** Files run in parallel; tests inside a file
do not. Two files sharing a fixture customer will interfere — the vendor app
identifies a job by its customer's name, so a customer who books in two places
puts two identically named buttons on the vendor's screen. Add a customer to
`CUSTOMERS` rather than borrowing one.

Sessions are minted once in `global-setup.ts` by running the real OTP exchange
over HTTP and saving the cookies. A spec opts in with
`test.use({ storageState: asRole('customer-book') })`. Specs that must start
signed out simply omit it.

## Determinism

- **Time.** Specs pick *tomorrow*, never today, so a run at 21:50 behaves like
  one at 09:00 and every booking sits clear of the 2-hour cancel/reschedule
  cutoff. The cases that need to be *inside* that cutoff are seeded at
  `now + 60min` rather than by manipulating clocks.
- **Network.** Razorpay, map tiles and the geocoder are blocked outright. A
  request reaching any of them means a stub failed to install.
- **Payments.** `E2E_FAKE_PAYMENTS=1` makes the server mint `order_e2e_*`
  orders and waive the signature check for exactly those ids. Everything after
  that — intent consumption, line items, the payment row, idempotency — runs
  for real. The browser side is stubbed by `support/network.ts`; use
  `setPaymentMode(page, 'dismiss' | 'fail')` for the unhappy paths.
- **OTP.** Read from the `otp_verifications` table, not from the
  `BYPASS_PHONES` list in `auth.service.ts` — those are real production numbers
  and tests should not depend on that bypass surviving.

## Known gaps, kept visible

One test is marked `test.fail()`. It is not an unwritten spec — it is a defect
the suite found, encoded so it stays on the report instead of in a comment
nobody reads. It will start passing when the underlying issue is fixed, at
which point Playwright flags the annotation as stale and it should be deleted
along with the explanation above it.

- `platform/accessibility.spec.ts` — white text on brand red `#EF3240` is
  3.87:1, under WCAG AA at small sizes (ScButton's primary style and the garage
  page's Add buttons, so every primary action). It is not fixable where it
  appears; the remedy is an accessible variant of the brand colour, which is a
  design decision. The check runs on the garage page, which has Add buttons.
  The other pairing it used to track — red text on a raised surface, from the
  segmented control's selected state — is gone: selected states are white on
  graphite now, and red text is kept off raised surfaces.

An open question: at a 320px viewport the home screen reports an 8px
horizontal overflow on a Linux CI runner and none on macOS, and the
element-level diagnostic in `platform/accessibility.spec.ts` finds nothing
whose bounding box exceeds the viewport — so it is a pseudo-element, a scroll
container, or a platform text-metric difference. The responsive check runs at
360px, which is the narrow end of what people actually carry. If you can
reproduce on Linux, the 8px is worth chasing.

`users/axe.spec.ts` is the P0 accessibility gate: axe on the signed-out
homepage, Home, the garage list, a garage, checkout, a booking, the help centre
and Profile, failing on serious and critical findings only. It leaves out the
same brand-red contrast pairing as above and nothing else; the platform spec
keeps the longer list of screens.

A note on measuring contrast: the accessibility spec waits for entrance
animations to finish before scanning. Cards enter through `.reveal`, which
starts at `opacity: 0`, and axe samples the *computed* colour — scanning early
measures half-faded text and reports failures that do not exist at rest. It
reported about twenty; three were real. `settle()` skips infinite animations
(shimmer, pulse), which never finish by design.

## Selectors

There are no `data-testid` attributes. Selectors are roles, accessible names
and `aria-pressed`, which means adding one is usually an accessibility fix
first: the rating stars had no accessible name at all, and the vendor list had
eight identical "Mark in progress" buttons. If you need a hook, add the name
the screen reader was missing.
