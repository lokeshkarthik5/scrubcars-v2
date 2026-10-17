# Starting the pilot clean (deleting test data)

Before launch, most bookings in the database were the team's own tests:
dummy bookings, ₹1 payments, refunds of them, receipt numbers issued on them.
**Start pilot clean** in admin deletes them, with everything attached, so the
pilot starts from an empty slate. It replaces the manual reset in the PR #21
deploy notes ("`TRUNCATE receipt_numbers, receipt_counters`, delete the test
bookings, re-run 0030"). That reset renumbered every receipt left behind, and
missed checkouts, checkout refunds and job photos. Don't use it any more,
except as the last-resort fallback described at the end.

The owner runs it from admin. Engineers and Claude never run it, or any
delete SQL, against production.

## What it deletes and what it keeps

**Deleted**, for every booking in the run, with its whole reschedule chain
(a booking that was moved goes together with the bookings it moved to and
from):

- the booking rows, their services, payment records, team notes, job photos
  (the database rows, then the files in R2, after the delete commits), final
  bills, reschedule history, promo-code uses, reviews, and recorded refunds
  (of the booking or its bills);
- its checkout (booking intent), and, in a cutoff run, every checkout opened
  before the cutoff that never became a booking (abandoned or failed), with
  its refund records;
- the receipt numbers issued on those bookings (see below);
- in a cutoff run, every customer complaint made before the cutoff
  (migration 0035), as one ticked row of the list: "4 complaints made before
  the cutoff (C-000001 to C-000004)". Untick it to keep them. Complaints are
  not part of any booking's chain: one about a booking that is deleted, but
  made after the cutoff, stays, with its booking reference and no link. The
  numbering does not restart: the next complaint carries on from the last
  number issued.

**Kept, always**: garages, services, photos and logos, offers and promo
codes (their usage counts drop by themselves, because usage is counted from
the promo-code uses), notices, customer accounts, cars, addresses and admin
settings.

**Kept whatever is ticked**, greyed out in the list with the reason:

- **Real money.** A booking whose payment, final bill or failed checkout was a
  live Razorpay payment, a cash payment, or a payment nobody can confirm was a
  test ("Real payment — kept"). From migration 0032 every new Razorpay order
  records its mode (`gateway_mode`: live, test or fake). Older rows have none,
  so the dry run asks Razorpay about each one with the server's keys and
  records the answer. With **live** keys: found means live, "does not exist"
  means it was a test payment. With **test** keys: a payment made with those
  keys is found and confirmed as a test; one they can't find could be live,
  so it is unknown and kept. Any failure (network, timeout, a refused key)
  is unknown, and unknown is always kept.
- **A payment that may still arrive** ("Payment may still arrive — kept"). A
  booking or checkout with nothing paid yet, but a Razorpay order that may be
  live and could still be captured: a pay-later booking that is still on, a
  final bill still due, or a booking cancelled or a checkout closed less than
  a day ago (a UPI request can be approved hours later). Deleting it would
  leave a late payment with no booking, nothing on the refunds list and no
  alert. Run again a day after it is cancelled or closed.
- A booking **changed after the cutoff** (moved to a new time after it).
- A checkout **still open** (it could still be paid).

## Receipt numbers

Receipt numbers are never renumbered (AGENTS.md). For each financial year
that has numbers on deleted bookings, the dry run says what happens:

- **"Numbering restarts at DTL/26-27/000001"**: every receipt of that year was
  test data, and no kept booking is still owed one. The year's numbers, any
  voids from an earlier run, and its counter are deleted. The first real
  receipt is 000001.
- **"Receipts DTL/26-27/000003 and 2 others are kept on record as void. The
  next receipt is DTL/26-27/000042"**: the year also has real receipts. The
  deleted numbers move to `receipt_number_voids` (with the run's audit id),
  and the counter is left alone, so the series stays gapless with the
  cancelled numbers on record. Ask the CA whether voids are fine for the
  Consumer Protection rule 5(1)(b) serial and for GST later (cancelled
  numbers in a series are normal practice; GSTR-1 has a cancelled count).

## Steps

1. **Before**, in the Razorpay **live** dashboard: export all live payments and
   refunds so far, and make sure every ₹1 (or other) live test payment has
   been refunded **and recorded** on admin → Refunds. Those bookings are kept
   (real money) and stay in the history, out of the pilot numbers once
   marked Test on their page.
2. **Note the keys.** In Vercel (API project, Production), `RAZORPAY_KEY_ID`
   starts with `rzp_live_` (live) or `rzp_test_` (test). Either works; no
   change is needed for the reset. With live keys, an old payment Razorpay
   can't find is confirmed as a test; with test keys, payments made with
   them are confirmed as tests and any it can't find are kept as real. Note
   when the keys went from test to live: that, or the launch moment, is the
   natural cutoff.
3. **Back up the database**, the same day: a Supabase backup, or
   `pg_dump "$DIRECT_URL" -Fc --no-owner -f detlio-before-reset.dump` over the
   direct connection (port 5432).
4. **Lokesh switches it on**: in Vercel, API project, Production, add
   `ADMIN_DATA_RESET=on` and redeploy. Admin now shows **Start pilot clean**
   in the menu (on a phone: a link at the top of Bookings).
5. **The owner runs it** in admin → Start pilot clean, preferably at a quiet
   hour (each run locks the bookings it deletes for a few seconds):
   1. **Scope**: "Everything before the cutoff" (now, by default; pick the
      launch moment) or "Only bookings marked Test". Untick any real booking
      (tap anywhere on its row). "Load again" keeps what you unticked.
   2. **Dry run**: read the counts and the receipt plan. If it says it is
      checking old payments with Razorpay, wait until it finishes. **Download
      list (CSV)**, required, and keep it with the backup.
   3. **Confirm**: your name, tick "I have a database backup from today", type
      the phrase it shows (for example `DELETE 143 BOOKINGS`), press the red
      button.

   If it says something changed since the dry run, nothing was deleted: run
   the dry run again. A run takes at most 300 bookings and 1,000 checkouts,
   oldest first ("Tick all" ticks that many, and the page says how many
   wait); run it again for the rest.
6. **Switch it off**: delete `ADMIN_DATA_RESET` in Vercel and redeploy. Every
   reset route is then a 404 and the menu item goes.

Each run writes one row to `admin_audit_log` (append-only: who, the name
typed, the counts, every deleted booking's ids, references, amounts,
Razorpay ids and receipt numbers, and the ids of every row in scope it kept
(with the reason) or that was left unticked; never phone numbers) and posts
"Test data cleared by <name>: N bookings" to the team's Telegram group. The
CSV from the dry run lists the same rows: deleted, kept and why, or
unticked.

## During the pilot

A test the team runs during the pilot (a booking on a team phone) can be
marked **Test** on its admin page. A marked booking is left out of the pilot
numbers and gets a "Test" badge and a "Test bookings" filter on the list. The
mark changes nothing else: slots, refunds and receipts never read it. While
the reset is switched on, a marked booking's page also offers **Delete test
booking**, the same dry run and confirmation for that one booking. Real money
is kept there too.

## Fallback: the manual reset

Only if the admin tool can't be used, and only for a financial year in which
**no real customer has a receipt**: back up, then in one `psql` session,
delete the year's `receipt_numbers` rows and its `receipt_counters` row first
(a numbered booking can't be deleted while its receipt row exists), then the
test bookings. Bookings alone leave behind their checkouts
(`booking_intents`), checkout refunds (`refund_records` of kind `checkout`)
and the photo files in R2, so delete those too. Don't re-run
`0030_receipt_numbers.sql` against a year that has real receipts: its
backfill numbers whatever paid bookings remain, in payment order. It is
already recorded in `schema_migrations`, so it would have to be run by hand
with `psql -f`.
