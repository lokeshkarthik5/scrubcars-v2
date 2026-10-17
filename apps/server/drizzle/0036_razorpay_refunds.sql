-- Refunds sent through Razorpay from the app, and the automatic mode.
--
-- Until now every refund was done by hand in the Razorpay dashboard and then
-- recorded here (0029). Ops can now press "Refund now" in admin, and with
-- AUTO_REFUNDS=on the clear-cut cases are refunded without anyone pressing
-- anything. A refund the app starts is not finished when Razorpay answers:
-- it is 'pending' until Razorpay's refund.processed or refund.failed
-- webhook, and a failed one must show as owed again without losing the
-- record that it was tried. So `refund_records` learns three things:
--
--   1. `source`: how the refund came to be recorded. 'recorded' is ops
--      recording one done by hand (Mark refunded; every row before this
--      migration), 'razorpay' one the app found on the payment in Razorpay
--      that it had no record of (done in the dashboard and never marked), and
--      'admin' / 'auto' one the app sent itself, from the Refund now button or
--      the automatic mode.
--   2. `gateway_status`: where Razorpay says the refund stands, 'pending',
--      'processed' or 'failed'; null when nobody has asked (a refund recorded
--      by hand, which Razorpay's webhook may later fill in). `settled_at` is
--      when it became processed or failed, and `failure_reason` says why it
--      failed, in plain words, for the team.
--   3. A failed refund keeps its row. The money row's running total is
--      lowered again, so the money is owed again, and a refund that Razorpay
--      refused outright (an error, no refund id) is recorded the same way as
--      a failed attempt. Because the running total then returns to a value a
--      failed row already holds, the one-refund-per-starting-total index
--      leaves failed rows out.
--
-- `auto_refund_cap_days` holds the days the automatic mode's daily cap
-- (AUTO_REFUND_DAILY_CAP_INR) was reached: one row per IST day, written once,
-- which is what stops automatic refunds for the rest of that day and sends
-- the team exactly one alert about it.
--
-- Additive for the code in production: the new columns default to what an
-- old insert means ('recorded', no gateway status), the replaced index keeps
-- its name and still refuses every duplicate the old code could write, and
-- nothing in production reads the new table.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

ALTER TABLE "refund_records"
  ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'recorded' NOT NULL;--> statement-breakpoint

ALTER TABLE "refund_records"
  ADD COLUMN IF NOT EXISTS "gateway_status" text;--> statement-breakpoint

ALTER TABLE "refund_records"
  ADD COLUMN IF NOT EXISTS "settled_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "refund_records"
  ADD COLUMN IF NOT EXISTS "failure_reason" varchar(300);--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refund_records_source_check'
  ) THEN
    ALTER TABLE "refund_records"
      ADD CONSTRAINT "refund_records_source_check"
      CHECK ("source" in ('recorded', 'razorpay', 'admin', 'auto'));
  END IF;
END
$$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refund_records_gateway_status_check'
  ) THEN
    ALTER TABLE "refund_records"
      ADD CONSTRAINT "refund_records_gateway_status_check"
      CHECK ("gateway_status" in ('pending', 'processed', 'failed'));
  END IF;
END
$$;--> statement-breakpoint

-- Only a refund Razorpay refused outright has no refund id and a gateway
-- status: a pending or processed one is a real Razorpay refund and has its
-- id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refund_records_gateway_ref_check'
  ) THEN
    ALTER TABLE "refund_records"
      ADD CONSTRAINT "refund_records_gateway_ref_check"
      CHECK ("gateway_status" IS NULL OR "gateway_status" = 'failed' OR "refund_ref" IS NOT NULL);
  END IF;
END
$$;--> statement-breakpoint

-- One standing refund per starting total on each payment. A failed one moved
-- no money and put the running total back, so the retry that follows starts
-- from the same total and must not collide with it.
DROP INDEX IF EXISTS "refund_records_kind_target_before_key";--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "refund_records_kind_target_before_key"
  ON "refund_records" ("kind", "target_id", "refunded_before")
  WHERE "gateway_status" IS DISTINCT FROM 'failed';--> statement-breakpoint

-- The daily cap adds up the day's automatic refunds.
CREATE INDEX IF NOT EXISTS "refund_records_auto_recorded_at_idx"
  ON "refund_records" ("recorded_at")
  WHERE "source" = 'auto';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auto_refund_cap_days" (
  -- The IST day, as the cap is counted.
  "day" date PRIMARY KEY NOT NULL,
  "reached_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- The cap in force then, and what had gone out automatically that day.
  "cap_amount" numeric(10, 2) NOT NULL,
  "sent_amount" numeric(10, 2) NOT NULL
);
