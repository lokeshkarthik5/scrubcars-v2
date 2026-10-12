-- The customer Home hub: offers shown on Home, team notices, the Updates read
-- state, a wash reminder interval per car, and the indexes Home's read uses.
--
-- Owner decisions that shape this:
--
--   1. Offers come first on Home. An admin marks a promo code "Show on Home"
--      and gives it a short title; the rest of the card (cap, code, end date)
--      is generated from the code's own columns, so it can never misstate a
--      limit. There is no free-text blurb.
--   2. Priority has three levels: Normal (0), High (1), Top (2).
--   3. "Who sees it" is one audience per offer: everyone (the default), new
--      customers, customers who booked this garage, customers near this
--      garage, customers whose wash is due, or owners of a car type. It only
--      decides who SEES the offer on Home; it never changes who may type the
--      code at checkout. Every audience but 'everyone' stays switched off by
--      the API (HOME_OFFER_TARGETING) until the privacy policy covers it.
--   4. A car's wash interval is the customer's choice of 7, 10, 14, 21 or 30
--      days. Null is the default: 14 days, 10 from 1 October to 31 December.
--   5. Team notices ("Slot may move: rain") go to everyone, or to customers
--      with a booking in a time window, optionally at one garage. They are not
--      the legal change-notice channel (Terms §19, Privacy §13).
--
-- Purely additive: today's API and apps never read any of it, so it is safe
-- to apply before the code that uses it is deployed.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

-- 1. Offers on Home -----------------------------------------------------------

ALTER TABLE "discounts"
  ADD COLUMN IF NOT EXISTS "show_on_home" boolean DEFAULT false NOT NULL;--> statement-breakpoint

ALTER TABLE "discounts"
  ADD COLUMN IF NOT EXISTS "home_title" varchar(60);--> statement-breakpoint

ALTER TABLE "discounts"
  ADD COLUMN IF NOT EXISTS "home_priority" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint

ALTER TABLE "discounts"
  ADD COLUMN IF NOT EXISTS "home_audience" text DEFAULT 'everyone' NOT NULL;--> statement-breakpoint

-- Only for 'near_this_garage': how far from the garage counts as near.
ALTER TABLE "discounts"
  ADD COLUMN IF NOT EXISTS "home_audience_radius_km" smallint;--> statement-breakpoint

-- Only for 'car_type': the car types that see it.
ALTER TABLE "discounts"
  ADD COLUMN IF NOT EXISTS "home_audience_vehicle_types" text[];--> statement-breakpoint

-- An offer on Home needs a title the card can show and an end date the card
-- can print ("Till Sat 17 Oct"). The API refuses both first, on the merged row
-- of a PATCH; this makes sure a hand-run UPDATE cannot either.
DO $$ BEGIN
  ALTER TABLE "discounts"
    ADD CONSTRAINT "discounts_home_fields_check"
    CHECK (
      NOT "show_on_home"
      OR (char_length(btrim(coalesce("home_title", ''))) BETWEEN 3 AND 60
          AND "ends_at" IS NOT NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "discounts"
    ADD CONSTRAINT "discounts_home_priority_check"
    CHECK ("home_priority" BETWEEN 0 AND 2);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Text with a CHECK rather than an enum, so a new audience is one constraint
-- swap rather than an ALTER TYPE. The garage audiences need a garage; the
-- radius belongs to 'near_this_garage' alone and the car types to
-- 'car_type' alone, so a row never carries a setting it does not use.
DO $$ BEGIN
  ALTER TABLE "discounts"
    ADD CONSTRAINT "discounts_home_audience_check"
    CHECK (
      "home_audience" IN ('everyone', 'new_customers', 'booked_this_garage',
                          'near_this_garage', 'wash_due', 'car_type')
      AND ("home_audience" NOT IN ('booked_this_garage', 'near_this_garage')
           OR "vendor_id" IS NOT NULL)
      AND (("home_audience" = 'near_this_garage')
           = ("home_audience_radius_km" IS NOT NULL))
      AND ("home_audience_radius_km" IS NULL
           OR "home_audience_radius_km" BETWEEN 1 AND 50)
      AND (("home_audience" = 'car_type')
           = ("home_audience_vehicle_types" IS NOT NULL))
      AND ("home_audience_vehicle_types" IS NULL
           OR (cardinality("home_audience_vehicle_types") >= 1
               AND "home_audience_vehicle_types"
                   <@ ARRAY['hatchback', 'sedan', 'suv']::text[]))
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Home reads "codes on Home that have not ended" on every open.
CREATE INDEX IF NOT EXISTS "discounts_on_home_idx"
  ON "discounts" ("ends_at")
  WHERE "show_on_home" AND "is_active";--> statement-breakpoint

-- 2. Updates read state -------------------------------------------------------

-- The moment the customer last looked at Updates; anything after it is
-- unread and lights the bell.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "updates_seen_at" timestamp with time zone;--> statement-breakpoint

-- Existing customers start with everything read, so the bell does not light
-- up for everyone on the day Home launches. Only touches rows still null, so
-- a re-run never moves anyone's read state.
UPDATE "users" SET "updates_seen_at" = now() WHERE "updates_seen_at" IS NULL;--> statement-breakpoint

-- 3. Wash interval per car ----------------------------------------------------

-- Null is the default interval (14 days, 10 in October to December). The
-- five values are the only ones the app offers.
ALTER TABLE "user_vehicles"
  ADD COLUMN IF NOT EXISTS "wash_interval_days" smallint;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_vehicles"
    ADD CONSTRAINT "user_vehicles_wash_interval_check"
    CHECK ("wash_interval_days" IS NULL OR "wash_interval_days" IN (7, 10, 14, 21, 30));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- 4. "Rate your wash" dismissed -----------------------------------------------

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "review_prompt_dismissed_at" timestamp with time zone;--> statement-breakpoint

-- 5. Team notices -------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "notice_audience" AS ENUM ('all', 'with_booking_between');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- `created_by` is a name rather than a users FK, like booking_notes.author:
-- the break-glass admin login has no users row.
CREATE TABLE IF NOT EXISTS "notices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(60) NOT NULL,
  "body" varchar(200) NOT NULL,
  "link_url" varchar(2048),
  "link_label" varchar(30),
  "audience" "notice_audience" DEFAULT 'all' NOT NULL,
  "vendor_id" uuid,
  "booking_from" timestamp with time zone,
  "booking_to" timestamp with time zone,
  "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by" varchar(100) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notices_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "notices_window_check" CHECK ("ends_at" > "starts_at"),
  -- 'all' carries no window and no garage. A booking window needs both ends:
  -- a null booking_to would pass a plain `booking_to > booking_from`.
  CONSTRAINT "notices_audience_check" CHECK (
    ("audience" = 'all'
       AND "booking_from" IS NULL AND "booking_to" IS NULL AND "vendor_id" IS NULL)
    OR ("audience" = 'with_booking_between'
       AND "booking_from" IS NOT NULL
       AND "booking_to" IS NOT NULL
       AND "booking_to" > "booking_from")
  ),
  CONSTRAINT "notices_link_pair_check"
    CHECK (("link_url" IS NULL) = ("link_label" IS NULL)),
  -- https://<host>, or a path inside the app. A protocol-relative //evil.com
  -- would leave the app, so a second slash is refused. So is a backslash
  -- anywhere (chr(92), so the check reads the same whatever
  -- standard_conforming_strings says): browsers read /\evil.com as
  -- //evil.com. And whitespace, which the URL parser strips.
  CONSTRAINT "notices_link_url_check"
    CHECK ("link_url" IS NULL OR (
      "link_url" ~ '^(https://[^/]|/([^/]|$))'
      AND strpos("link_url", chr(92)) = 0
      AND "link_url" !~ '[[:space:]]'
    ))
);--> statement-breakpoint

-- Home reads the live notices on every open: active, started, not ended.
CREATE INDEX IF NOT EXISTS "notices_live_idx"
  ON "notices" ("starts_at", "ends_at")
  WHERE "is_active";--> statement-breakpoint

-- A customer's ×, kept on the server so it holds on every device. Both FKs
-- cascade, so deleting an account or a notice leaves nothing behind.
CREATE TABLE IF NOT EXISTS "notice_dismissals" (
  "user_id" uuid NOT NULL,
  "notice_id" uuid NOT NULL,
  "dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notice_dismissals_pkey" PRIMARY KEY ("user_id", "notice_id"),
  CONSTRAINT "notice_dismissals_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "notice_dismissals_notice_id_notices_id_fk"
    FOREIGN KEY ("notice_id") REFERENCES "public"."notices"("id")
    ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint

-- The same for offers: × hides an offer from this customer's Home for good.
-- It does not stop them typing the code at checkout.
CREATE TABLE IF NOT EXISTS "offer_dismissals" (
  "user_id" uuid NOT NULL,
  "discount_id" uuid NOT NULL,
  "dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "offer_dismissals_pkey" PRIMARY KEY ("user_id", "discount_id"),
  CONSTRAINT "offer_dismissals_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "offer_dismissals_discount_id_discounts_id_fk"
    FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id")
    ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint

-- 6. Indexes for Home's read --------------------------------------------------

-- "This customer's bookings, newest first", which Home and Updates read on
-- every open. Plain CREATE INDEX: the tables are small at pilot size, and
-- CONCURRENTLY cannot run inside the migration's transaction.
CREATE INDEX IF NOT EXISTS "bookings_user_scheduled_at_idx"
  ON "bookings" ("user_id", "scheduled_at" DESC);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "refund_records_booking_id_idx"
  ON "refund_records" ("booking_id");
