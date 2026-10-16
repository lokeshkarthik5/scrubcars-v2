-- Starting the pilot clean: what the admin "Start pilot clean" page and the
-- per-booking "Test" mark need. Most bookings made before launch were the
-- team's own tests, and they would otherwise sit in the pilot numbers, the
-- garages' history, the refunds list and the promo-code counts for good.
--
-- Owner decisions that shape this:
--
--   1. The owner deletes test data from admin, after a dry run, a CSV of what
--      goes, and a typed confirmation, behind ADMIN_DATA_RESET (off unless
--      set). Nobody runs SQL against production for it.
--   2. Real money is never deleted. A booking chain whose payment Razorpay
--      confirms as live, or that cannot be confirmed as a test payment, is
--      kept. `gateway_mode` records the mode of every new Razorpay order from
--      now on (from the key id it was opened with), so the question only has
--      to be asked of Razorpay for rows from before this file.
--   3. Receipt numbers are never renumbered. When every receipt of a
--      financial year is test data, that year's numbering restarts at
--      000001. Otherwise the deleted test numbers are kept in
--      `receipt_number_voids`, and the series carries on after them, so the
--      year stays gapless with the cancelled numbers on record.
--   4. A single booking can be marked "Test" by ops during the pilot: it is
--      left out of the pilot numbers and can be deleted through the same dry
--      run. The mark changes nothing about slots, refunds or receipts.
--
-- Purely additive: nullable columns and new tables. Today's API never reads
-- any of it, so it is safe to apply before the code that uses it is deployed.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

-- 1. The "Test" mark ------------------------------------------------------------

-- Set on every booking of a reschedule chain at once, and copied onto the
-- booking a reschedule writes, so the chain is marked as a whole. `by` is a
-- name, like booking_notes.author: the break-glass admin login has no users
-- row.
ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "marked_test_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "marked_test_by" varchar(100);--> statement-breakpoint

-- The admin list's "Test bookings" filter, and the dry run's "only bookings
-- marked Test". Few rows ever have it, so the index is partial.
CREATE INDEX IF NOT EXISTS "bookings_marked_test_at_idx"
  ON "bookings" ("marked_test_at")
  WHERE "marked_test_at" IS NOT NULL;--> statement-breakpoint

-- 2. Which Razorpay mode the money was taken in --------------------------------

-- 'live' or 'test' from the key id the order was opened with (rzp_live_… is
-- live, anything else test), 'fake' for an order the server minted itself
-- under E2E_FAKE_PAYMENTS. Null on rows from before this file, until a dry
-- run asks Razorpay about them. Text with a CHECK rather than an enum, like
-- discounts.home_audience. Nothing may branch payment logic on it.
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "gateway_mode" text
  CONSTRAINT "payments_gateway_mode_check"
  CHECK ("gateway_mode" IN ('live', 'test', 'fake'));--> statement-breakpoint

ALTER TABLE "booking_intents"
  ADD COLUMN IF NOT EXISTS "gateway_mode" text
  CONSTRAINT "booking_intents_gateway_mode_check"
  CHECK ("gateway_mode" IN ('live', 'test', 'fake'));--> statement-breakpoint

ALTER TABLE "booking_charges"
  ADD COLUMN IF NOT EXISTS "gateway_mode" text
  CONSTRAINT "booking_charges_gateway_mode_check"
  CHECK ("gateway_mode" IN ('live', 'test', 'fake'));--> statement-breakpoint

-- 3. The admin audit log -------------------------------------------------------

-- One row per destructive admin action, written in the same transaction as
-- the action. Deliberately no foreign keys: the rows it describes are the
-- ones the action deletes. The snapshot in `detail` names bookings,
-- customers and garages by id and reference, and Razorpay ids, never phone
-- numbers. `actor_sub` is the session's subject ('admin' for the shared
-- login); `actor_name` is the name the person typed, since the shared login
-- cannot say who they are.
CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "action" text NOT NULL,
  "actor_sub" text NOT NULL,
  "actor_name" varchar(100) NOT NULL,
  "summary" jsonb NOT NULL,
  "detail" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "admin_audit_log_created_at_idx"
  ON "admin_audit_log" ("created_at");--> statement-breakpoint

-- Append-only, held by the database as well as the code: a record of what
-- was deleted is only worth something if it cannot be edited afterwards.
CREATE OR REPLACE FUNCTION "admin_audit_log_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only';
END
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS "admin_audit_log_append_only" ON "admin_audit_log";--> statement-breakpoint

CREATE TRIGGER "admin_audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "admin_audit_log"
  FOR EACH ROW EXECUTE FUNCTION "admin_audit_log_append_only"();--> statement-breakpoint

-- 4. Void receipt numbers ------------------------------------------------------

-- A receipt number issued on test data that was then deleted, in a financial
-- year that also has real receipts. The number is not given out again (the
-- year's counter is left where it was), and it stays on record here, so the
-- series reads 000001 to 000041 with the cancelled ones accounted for.
--
-- `root_booking_id` has no foreign key: the booking is gone. `audit_id` is the
-- reset that voided it. A restart (every receipt of the year was test data)
-- deletes that year's voids along with its counter, so a new 000001 is never
-- confused with an old one.
CREATE TABLE IF NOT EXISTS "receipt_number_voids" (
  "financial_year" text NOT NULL,
  "seq" integer NOT NULL,
  "number" text NOT NULL,
  "issued_at" timestamp with time zone NOT NULL,
  "root_booking_id" uuid NOT NULL,
  "voided_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reason" text NOT NULL,
  "audit_id" uuid NOT NULL,
  CONSTRAINT "receipt_number_voids_pkey" PRIMARY KEY ("financial_year", "seq"),
  CONSTRAINT "receipt_number_voids_number_unique" UNIQUE ("number"),
  CONSTRAINT "receipt_number_voids_seq_check" CHECK ("seq" > 0),
  CONSTRAINT "receipt_number_voids_number_length_check" CHECK (char_length("number") <= 16),
  CONSTRAINT "receipt_number_voids_audit_id_admin_audit_log_id_fk"
    FOREIGN KEY ("audit_id") REFERENCES "public"."admin_audit_log"("id")
    ON DELETE restrict ON UPDATE no action
);
