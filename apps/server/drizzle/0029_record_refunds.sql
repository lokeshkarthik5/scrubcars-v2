-- Recording refunds, so Detlio knows what it still owes customers.
--
-- Three owner decisions shape this:
--
--   1. Refunds stay manual in the Razorpay dashboard for the pilot: nothing
--      here calls Razorpay. What changes is that ops records each refund
--      once it is done (the Razorpay refund id, the amount, who did it), so
--      "who still needs refunding?" is a list instead of a search through
--      Telegram.
--   2. Money can come back three ways, so each place money lands gets the
--      same five columns: `payments` (a booking's own payment), and
--      `booking_intents` (a checkout whose payment was captured but became no
--      booking: status 'failed'), and `booking_charges` (a final bill paid on
--      a booking that was then cancelled, or a payment that landed on a bill
--      the garage had replaced or ops had withdrawn).
--   3. A refund can be the whole amount or part of it. `refunded_amount`
--      adds up every refund recorded so far; the ref, time, person and note
--      describe the latest one (each one also leaves a booking note, when
--      there is a booking). A full refund of a booking's payment moves it to
--      payments.status 'refunded'; a part refund leaves it 'paid'.
--   4. Every refund is also its own row in `refund_records`, because a later
--      part refund overwrites the latest one on the money row. That history
--      is what a Razorpay refund id is checked against (unique, so one
--      refund can't be recorded on two customers), and one record per
--      starting total means a retried request can't record a refund twice.
--
-- `refund_ref` is the Razorpay refund id (rfnd_…), or null for money sent
-- back another way (UPI, bank transfer), in which case `refund_note` says how.
-- `refunded_by` is a name rather than a users FK, like booking_notes.author:
-- the break-glass admin login has no users row.
--
-- Each file runs through `psql -f` without a wrapping transaction. Every
-- statement is safe to re-run.

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "refunded_amount" numeric(10, 2);--> statement-breakpoint

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "refund_ref" varchar(64);--> statement-breakpoint

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "refunded_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "refunded_by" varchar(100);--> statement-breakpoint

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "refund_note" text;--> statement-breakpoint

ALTER TABLE "booking_intents"
  ADD COLUMN IF NOT EXISTS "refunded_amount" numeric(10, 2);--> statement-breakpoint

ALTER TABLE "booking_intents"
  ADD COLUMN IF NOT EXISTS "refund_ref" varchar(64);--> statement-breakpoint

ALTER TABLE "booking_intents"
  ADD COLUMN IF NOT EXISTS "refunded_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "booking_intents"
  ADD COLUMN IF NOT EXISTS "refunded_by" varchar(100);--> statement-breakpoint

ALTER TABLE "booking_intents"
  ADD COLUMN IF NOT EXISTS "refund_note" text;--> statement-breakpoint

ALTER TABLE "booking_charges"
  ADD COLUMN IF NOT EXISTS "refunded_amount" numeric(10, 2);--> statement-breakpoint

ALTER TABLE "booking_charges"
  ADD COLUMN IF NOT EXISTS "refund_ref" varchar(64);--> statement-breakpoint

ALTER TABLE "booking_charges"
  ADD COLUMN IF NOT EXISTS "refunded_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "booking_charges"
  ADD COLUMN IF NOT EXISTS "refunded_by" varchar(100);--> statement-breakpoint

ALTER TABLE "booking_charges"
  ADD COLUMN IF NOT EXISTS "refund_note" text;--> statement-breakpoint

-- More money back than was taken is never right, whoever writes it. The API
-- refuses it first; these make sure a hand-run UPDATE cannot either.
DO $$ BEGIN
  ALTER TABLE "payments"
    ADD CONSTRAINT "payments_refunded_amount_check"
    CHECK ("refunded_amount" IS NULL OR ("refunded_amount" > 0 AND "refunded_amount" <= "amount"));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "booking_intents"
    ADD CONSTRAINT "booking_intents_refunded_amount_check"
    CHECK ("refunded_amount" IS NULL OR ("refunded_amount" > 0 AND "refunded_amount" <= "amount"));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "booking_charges"
    ADD CONSTRAINT "booking_charges_refunded_amount_check"
    CHECK ("refunded_amount" IS NULL OR ("refunded_amount" > 0 AND "refunded_amount" <= "amount_due"));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- A booking the customer moved to a new time is cancelled with its payment
-- still 'paid': the payment went with the move, so nothing is owed on it.
-- The refunds list tells those apart by looking for the booking it moved to,
-- once per cancelled booking, which this keeps from scanning the table.
CREATE INDEX IF NOT EXISTS "bookings_rescheduled_from_id_idx"
  ON "bookings" ("rescheduled_from_id");--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "refund_kind" AS ENUM ('booking', 'checkout', 'bill');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- `target_id` is the booking's id for its payment, the checkout's, or the
-- bill's, as `kind` says: no FK, since it points into one of three tables.
-- `refunded_before` is the running total the refund was recorded against.
CREATE TABLE IF NOT EXISTS "refund_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" "refund_kind" NOT NULL,
  "target_id" uuid NOT NULL,
  "booking_id" uuid,
  "amount" numeric(10, 2) NOT NULL,
  "refunded_before" numeric(10, 2) NOT NULL,
  "refund_ref" varchar(64),
  "refund_note" text,
  "recorded_by" varchar(100) NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "refund_records_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "refund_records_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint

-- One Razorpay refund belongs to one refund of one payment. Nulls (money
-- sent back by UPI or bank) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS "refund_records_refund_ref_key"
  ON "refund_records" ("refund_ref");--> statement-breakpoint

-- One refund per starting total on each payment: the same request sent
-- twice finds its first record already there.
CREATE UNIQUE INDEX IF NOT EXISTS "refund_records_kind_target_before_key"
  ON "refund_records" ("kind", "target_id", "refunded_before");
