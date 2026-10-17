-- First-party usage events, for the booking funnel in admin's Statistics.
--
-- The owner wants to see where customers drop off on the way to a booking
-- (search, a garage's page, checkout, paid) and, ahead of the loyalty
-- programme, whether customers come back. Until now the only measurement
-- on detlio.com was Meta's pixel, which reports to Meta, not to us. This is
-- Detlio's own, with no third party involved:
--
--   - `analytics_events`: one row per thing a customer did in the app
--     (opened it, saw a garage, started checkout, picked a slot, pressed
--     Pay, …), sent by the customer app in small batches to
--     POST /api/v1/events, plus two the API records itself when a payment
--     lands or a booking is cancelled (`booking_paid`,
--     `booking_cancelled`), so the last step of the funnel does not depend
--     on the customer's browser staying open.
--
-- What a row holds, and what it never does:
--
--   - `visit_id`: a random id the app makes when a browser tab opens Detlio
--     and keeps in sessionStorage, so it is gone when the tab closes. Not a
--     cookie, not localStorage: the next visit is a new id. Null on the
--     API's own events.
--   - `user_id`: the signed-in customer, only when signed in, and only on
--     the app's events. ON DELETE SET NULL, so deleting an account (DELETE
--     /users/me) leaves its events anonymous rather than refusing.
--   - `props`: a few allow-listed facts (a garage's id, the booking type, a
--     service category, how many services, a price band, the campaign
--     source, the length of a search but never its words). The API refuses
--     any other key; the CHECK below is the backstop.
--   - `path`: the page, without its query string, ids replaced by ":id".
--   - `device`: phone, tablet or desktop, from the window's width. Never
--     the user agent, IP address or anything else that identifies a device.
--   - `app_version`: the customer app's version, for reading a change.
--
-- Kept 180 days: the pending-digest cron deletes older rows a batch at a
-- time (modules/analytics). The test-data reset clears a cutoff run's
-- events with their own tick.
--
-- Purely additive: a new table that today's API never reads, so it is safe
-- to apply before the code that uses it is deployed.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- Text with a CHECK rather than an enum, like complaints.category: a new
  -- event is one constraint swap, not an ALTER TYPE.
  "name" text NOT NULL,
  "visit_id" uuid,
  "user_id" uuid,
  "props" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "path" varchar(200),
  "device" text,
  "app_version" varchar(32),
  CONSTRAINT "analytics_events_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "analytics_events_name_check" CHECK (
    "name" IN ('app_open', 'home_view', 'garage_list_view', 'search', 'map_view',
               'garage_view', 'service_add', 'checkout_start', 'slot_select',
               'address_select', 'pay_click', 'booking_paid', 'booking_cancelled',
               'review_submit', 'complaint_submit', 'help_view')
  ),
  CONSTRAINT "analytics_events_device_check" CHECK (
    "device" IS NULL OR "device" IN ('phone', 'tablet', 'desktop')
  ),
  -- A small object of allow-listed keys and nothing else: no nested
  -- objects, no free text (the API checks each value's shape too).
  CONSTRAINT "analytics_events_props_check" CHECK (
    jsonb_typeof("props") = 'object'
    AND "props" - ARRAY['vendorId', 'mode', 'category', 'serviceCount', 'amountBucket',
                        'source', 'step', 'queryLength', 'cancelledBy']::text[] = '{}'::jsonb
  ),
  -- The app's events come from a visit; the API's own come from none.
  CONSTRAINT "analytics_events_visit_check" CHECK (
    ("name" IN ('booking_paid', 'booking_cancelled')) = ("visit_id" IS NULL)
  )
);--> statement-breakpoint

-- Every Statistics read is a time range, the funnel's by event name: the
-- funnel, the garages' views and the devices.
CREATE INDEX IF NOT EXISTS "analytics_events_name_occurred_at_idx"
  ON "analytics_events" ("name", "occurred_at");--> statement-breakpoint

-- The 180-day clean-up and the reset's "before the cutoff", and "since
-- when there are events".
CREATE INDEX IF NOT EXISTS "analytics_events_occurred_at_idx"
  ON "analytics_events" ("occurred_at");--> statement-breakpoint

-- So deleting an account finds its events to null out without reading the
-- table. Most events have no user, so it is partial.
CREATE INDEX IF NOT EXISTS "analytics_events_user_id_idx"
  ON "analytics_events" ("user_id")
  WHERE "user_id" IS NOT NULL;
