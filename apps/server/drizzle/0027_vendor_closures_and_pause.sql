-- Holidays and "pause new bookings" for a garage.
--
-- Two owner decisions shape this:
--
--   1. A garage can mark single days shut on top of its weekly off days. A
--      date in `vendor_closures` offers no slots and refuses checkout, the
--      same as a weekly closed day. `date` is the garage's IST calendar day,
--      the day key the slot picker and the booking checks already use.
--   2. A garage can stop taking new bookings without being archived. While
--      `bookings_paused_at` is set it drops out of the lists, search and the
--      map and refuses checkout, but its page still loads and its existing
--      bookings carry on.
--
-- Neither touches a booking that already exists: the garage is shown them and
-- sorts them out with the customers.
--
-- Each file runs through `psql -f` without a wrapping transaction. Every
-- statement is safe to re-run.

CREATE TABLE IF NOT EXISTS "vendor_closures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "date" date NOT NULL,
  "reason" varchar(200),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendor_closures_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint

-- One row per garage per day, and the index every read uses: "is this garage
-- shut on this date" and "this garage's days from today on".
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_closures_vendor_date_key"
  ON "vendor_closures" ("vendor_id", "date");--> statement-breakpoint

ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "bookings_paused_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "bookings_paused_reason" varchar(200);
