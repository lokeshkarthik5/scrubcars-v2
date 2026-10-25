-- "Notify me if a slot opens": a customer's alert for a full day at a garage.
--
-- When the day a customer wants is booked up (or the part of the day they
-- want is), checkout offers "Notify me if a slot opens". The alert is for one
-- garage and one IST date, for the job they were booking (its total length
-- and booking type), in a part of the day: any time, morning (6–12),
-- afternoon (12–17) or evening (17–22). Whenever that garage frees capacity
-- on that date (a cancellation by anyone, a decline, an auto-cancel, a
-- booking moved away, a holiday removed, a pause lifted, hours changed) the
-- API re-checks it with the slot list's own rule, and if a time in the window
-- is free the customer is told once: a browser notification (when on) and an
-- Updates row. The time is not held: first to book gets it.
--
--   - `slot_alerts`: one row per alert. `time_window` (text + CHECK),
--     `booking_type` (the existing enum), `duration_mins` (the services'
--     total), `service_ids` (only for the link back to checkout; no FK, a
--     withdrawn service sends checkout back to the garage page),
--     `expires_at` (the end of `date` in IST), `notified_at` and
--     `notified_slot_at` (when it was told, and the time it was told about;
--     both or neither, CHECK), `last_checked_at` (the cron's sweep). At most
--     one waiting (not notified) alert per customer, garage and date: a
--     partial unique index. At most 5 waiting per customer, counted by the
--     API under a per-customer lock. Cascades with the customer and with the
--     garage; notified and expired rows are deleted by the cron after 31
--     days.
--
-- Purely additive: a new table nothing in production reads yet, so it is
-- safe to apply before the code that uses it is deployed.
--
-- Numbering: 0045 and 0046 belong to branches built at the same time
-- (job photo standards, car history); this file and its journal entry are
-- written to sit after them. Nothing here depends on either.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

CREATE TABLE IF NOT EXISTS "slot_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "vendor_id" uuid NOT NULL,
  "date" date NOT NULL,
  "time_window" text DEFAULT 'any' NOT NULL,
  "booking_type" "booking_type" NOT NULL,
  "duration_mins" integer NOT NULL,
  "service_ids" uuid[] NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "notified_at" timestamp with time zone,
  "notified_slot_at" timestamp with time zone,
  "last_checked_at" timestamp with time zone,
  CONSTRAINT "slot_alerts_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "slot_alerts_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "slot_alerts_time_window_check"
    CHECK ("time_window" IN ('any', 'morning', 'afternoon', 'evening')),
  -- A whole day at most: no garage is open longer.
  CONSTRAINT "slot_alerts_duration_mins_check"
    CHECK ("duration_mins" > 0 AND "duration_mins" <= 1440),
  -- The picker's own limit on services in one booking.
  CONSTRAINT "slot_alerts_service_ids_check"
    CHECK (cardinality("service_ids") BETWEEN 1 AND 10),
  -- Told once, about one time: both stamps or neither.
  CONSTRAINT "slot_alerts_notified_check"
    CHECK (("notified_at" IS NULL) = ("notified_slot_at" IS NULL))
);--> statement-breakpoint

-- One waiting alert per customer, garage and date; setting it again changes
-- the window instead.
CREATE UNIQUE INDEX IF NOT EXISTS "slot_alerts_waiting_key"
  ON "slot_alerts" ("user_id", "vendor_id", "date")
  WHERE "notified_at" IS NULL;--> statement-breakpoint

-- The re-check after a cancellation: a garage's waiting alerts for one date.
CREATE INDEX IF NOT EXISTS "slot_alerts_garage_day_idx"
  ON "slot_alerts" ("vendor_id", "date")
  WHERE "notified_at" IS NULL;--> statement-breakpoint

-- The customer's list, the cap, and Updates.
CREATE INDEX IF NOT EXISTS "slot_alerts_user_id_idx"
  ON "slot_alerts" ("user_id");--> statement-breakpoint

-- The cron's clean-up of old rows.
CREATE INDEX IF NOT EXISTS "slot_alerts_expires_at_idx"
  ON "slot_alerts" ("expires_at");
