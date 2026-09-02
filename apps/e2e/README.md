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

## Selectors

There are no `data-testid` attributes. Selectors are roles, accessible names
and `aria-pressed`, which means adding one is usually an accessibility fix
first: the rating stars had no accessible name at all, and the vendor list had
eight identical "Mark in progress" buttons. If you need a hook, add the name
the screen reader was missing.
