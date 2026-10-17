-- A garage accepts a paid booking within 30 minutes of its opening hours, or
-- the booking is cancelled with a full refund (behind AUTO_CANCEL_UNANSWERED).
--
-- Owner decision (17 Oct 2026): the garage has 30 minutes during its opening
-- hours to accept, reject or suggest other times for a paid booking. Paid
-- while it is shut (outside its hours that IST day, a holiday, paused), the
-- clock starts when it next opens. Never later than 1 hour before the slot;
-- if that would leave under 15 minutes from payment, 15 minutes, never past
-- the slot's start. The rules are lib/response-deadline.ts.
--
--   `bookings.respond_by`: the deadline, written with the payment (or the
--   customer's reschedule back to pending). Null = no deadline: every row
--   from before this file, unpaid bookings, and garage-suggested times.
--   Nothing is backfilled.
--   `bookings.response_missed_at`: set only by the pending-digest cron's
--   auto-cancel, which cancels as the garage (`cancelled_by = 'vendor'`), so
--   lib/refunds.ts owes a full refund, AUTO_REFUNDS treats it as a garage
--   decline and Statistics count it with garage declines. The CHECK keeps it
--   to exactly that.
--
-- Purely additive: two nullable columns, two small partial indexes and a
-- CHECK every existing row passes (both columns are null). Today's API never
-- reads or writes them. The CHECK compares the enums as ::text, as 0026 and
-- 0037 did.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "respond_by" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "response_missed_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_response_missed_check";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_response_missed_check" CHECK (
  "response_missed_at" IS NULL
  OR ("status"::text = 'cancelled' AND "cancelled_by"::text = 'vendor' AND "respond_by" IS NOT NULL)
);--> statement-breakpoint

-- The sweep: paid pending bookings past their deadline, oldest first.
CREATE INDEX IF NOT EXISTS "bookings_respond_by_pending_idx"
  ON "bookings" ("respond_by")
  WHERE "status" = 'pending' AND "respond_by" IS NOT NULL;--> statement-breakpoint

-- The 07:00 roll-up: yesterday's auto-cancels per garage.
CREATE INDEX IF NOT EXISTS "bookings_response_missed_at_idx"
  ON "bookings" ("response_missed_at")
  WHERE "response_missed_at" IS NOT NULL;
