-- Free browser notifications (Web Push) for garages and customers, and the
-- customer's booking reminders.
--
-- Owner decision (17 Oct 2026): SMS costs money and WhatsApp needs Meta's
-- approval, so for now garages hear about a new booking, and customers about
-- theirs, through the browser's own notifications (Web Push with VAPID,
-- free). Native app push comes later and plugs into the same sender.
--
-- Three changes:
--
--   - `push_subscriptions`: one row per browser that turned notifications
--     on. `endpoint` is the push service's URL for that browser (unique; a
--     device identifier, never logged), `p256dh`/`auth` the keys a message is
--     encrypted with. `audience` is the app it came from: `customer`
--     (detlio.com) or `garage` (vendor.detlio.com, with the garage it was
--     turned on for in `vendor_id`, exactly when `garage`). Removed when the
--     person turns it off, or when the push service says the browser dropped
--     it (404/410). Cascades with the user and with the garage.
--   - `notification_sends`: the scheduled ones already sent (the evening-
--     before and hour-before reminders, a garage's "accept within 10 min"),
--     one per booking per kind, claimed before sending so overlapping cron
--     runs never send twice. Cascades with the booking.
--   - `users.push_booking_updates` / `users.push_reminders`: the customer's
--     two switches in Profile → Notifications, both on by default.
--
-- Purely additive: two new tables and two new columns with defaults that
-- today's API never reads, so it is safe to apply before the code that uses
-- it is deployed. Adding a NOT NULL column with a constant default does not
-- rewrite `users` (PostgreSQL 11+).
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "push_booking_updates" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "push_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "endpoint" varchar(1024) NOT NULL,
  "p256dh" varchar(200) NOT NULL,
  "auth" varchar(100) NOT NULL,
  "user_id" uuid NOT NULL,
  "audience" text NOT NULL,
  "vendor_id" uuid,
  "device_label" varchar(60),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_success_at" timestamp with time zone,
  "failure_count" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "push_subscriptions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "push_subscriptions_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "push_subscriptions_audience_check" CHECK ("audience" IN ('customer', 'garage')),
  -- A garage's subscription names its garage; a customer's never does.
  CONSTRAINT "push_subscriptions_vendor_check" CHECK (("audience" = 'garage') = ("vendor_id" IS NOT NULL)),
  -- Push services hand out https URLs only (lib/push.ts checks the host too).
  CONSTRAINT "push_subscriptions_endpoint_check" CHECK ("endpoint" LIKE 'https://%'),
  CONSTRAINT "push_subscriptions_failure_count_check" CHECK ("failure_count" >= 0)
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key"
  ON "push_subscriptions" ("endpoint");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx"
  ON "push_subscriptions" ("user_id");--> statement-breakpoint

-- Every subscribed device of a garage, for its booking events.
CREATE INDEX IF NOT EXISTS "push_subscriptions_vendor_id_idx"
  ON "push_subscriptions" ("vendor_id")
  WHERE "vendor_id" IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notification_sends" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notification_sends_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "notification_sends_booking_id_kind_key" UNIQUE ("booking_id", "kind"),
  CONSTRAINT "notification_sends_kind_check" CHECK ("kind" IN ('day_before', 'hour_before', 'respond_soon'))
);
