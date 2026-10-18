-- Car history and service reminders (idea #13): coating and detailing
-- follow-ups for a customer's car.
--
-- Owner decision (18 Oct 2026): when a coating job completes, the car gets a
-- maintenance wash reminder 3 months later and a coating check 12 months
-- later; after a detailing, a suggested repeat 6 months later
-- (lib/service-reminders.ts). Shown on the car's history page, as Home's
-- soft card when there is room, in Updates, and sent once as a browser
-- notification on the due date's 09:00 IST cron run.
--
-- One new table, `vehicle_service_reminders`:
--
--   - one row per finished job per kind (unique on the job and the kind), so
--     writing them again (the completion and the cron's catch-up) does
--     nothing twice;
--   - `due_on` is an IST calendar date; `snoozed_until` (the customer's "in 2
--     weeks") moves the date in force; `notified_on` is the date the
--     notification went for, claimed by a conditional update so overlapping
--     cron runs never send it twice;
--   - `status` is open until dismissed, done (a booking answered it,
--     `done_booking_id`) or superseded (a newer job of the same kind);
--     `closed_at` is set exactly when it is not open (CHECK).
--
-- Cascades with the customer, the car and the job that scheduled it, so
-- DELETE /users/me, the pilot reset and Delete forever take reminders with
-- the bookings they came from. A car with bookings is archived, never
-- deleted (bookings.vehicle_id is RESTRICT), so its reminders stay with it
-- and are simply not shown. The answering booking is a link only (SET NULL).
-- Nothing here touches bookings, payments or receipts.
--
-- Numbered 0046: 0045 belongs to the job photo standards branch, built in
-- parallel; the migrations lint reports the gap until 0045 is merged.
--
-- Purely additive: a new table no deployed code reads, so it is safe to
-- apply before the code that uses it. Applied by scripts/migrate.sh, one
-- transaction per file. Every statement is also safe to re-run.

CREATE TABLE IF NOT EXISTS "vehicle_service_reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "vehicle_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "due_on" date NOT NULL,
  "source_booking_id" uuid NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "snoozed_until" date,
  "notified_on" date,
  "closed_at" timestamp with time zone,
  "done_booking_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vehicle_service_reminders_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "vehicle_service_reminders_vehicle_id_user_vehicles_id_fk"
    FOREIGN KEY ("vehicle_id") REFERENCES "public"."user_vehicles"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "vehicle_service_reminders_source_booking_id_bookings_id_fk"
    FOREIGN KEY ("source_booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "vehicle_service_reminders_done_booking_id_bookings_id_fk"
    FOREIGN KEY ("done_booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "vehicle_service_reminders_source_kind_key" UNIQUE ("source_booking_id", "kind"),
  CONSTRAINT "vehicle_service_reminders_kind_check"
    CHECK ("kind" IN ('maintenance_wash', 'coating_check', 'detailing_repeat')),
  CONSTRAINT "vehicle_service_reminders_status_check"
    CHECK ("status" IN ('open', 'dismissed', 'done', 'superseded')),
  -- Closed exactly when it is no longer open.
  CONSTRAINT "vehicle_service_reminders_closed_check"
    CHECK (("status" = 'open') = ("closed_at" IS NULL))
);--> statement-breakpoint

-- A car's open reminders: its history page, Home and each completion.
CREATE INDEX IF NOT EXISTS "vehicle_service_reminders_open_vehicle_idx"
  ON "vehicle_service_reminders" ("vehicle_id")
  WHERE "status" = 'open';--> statement-breakpoint

-- The cron's due-date runs.
CREATE INDEX IF NOT EXISTS "vehicle_service_reminders_open_due_idx"
  ON "vehicle_service_reminders" ("due_on")
  WHERE "status" = 'open';--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vehicle_service_reminders_user_id_idx"
  ON "vehicle_service_reminders" ("user_id");
