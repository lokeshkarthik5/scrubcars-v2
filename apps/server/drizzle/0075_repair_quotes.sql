-- Repair & bodywork quotes (modules/repair-quotes; screens OK'd 15 Nov 2026).
-- Dent or scratch? The customer shows the damage (a short video and/or up to
-- 3 photos) and says what happened in one line; Detlio writes a plain brief
-- from still frames; up to 5 nearby garages that take repair quotes answer
-- with an estimate (or "Can't do") within 4 of their working hours; the
-- customer books a visit at one of them as today's "price on inspection"
-- booking (0073), with nothing to pay.
--
--   vendors.repair_quotes_enabled   the garage takes repair & bodywork quotes
--                                   (admin's switch; off for every garage)
--   repair_quote_requests           one per customer request: the car, where
--                                   it was sent from (rounded), the customer's
--                                   line, the brief, the private media keys
--   repair_quotes                   one per garage asked: its clock and answer,
--                                   and the booking a visit became
--
-- Media are private (the job photos' bucket, R2_DOCS_BUCKET, under
-- repair-quotes/<customer>/…): the rows hold object KEYS, never addresses.
--
-- Purely additive: today's API never reads these, so it is safe to apply
-- before the code that uses it is deployed (the code is also behind
-- REPAIR_QUOTES_ENABLED=on). Applied by scripts/migrate.sh, one transaction
-- per file. Every statement is safe to re-run.

ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "repair_quotes_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "repair_quote_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "vehicle_id" uuid,
  -- The car as it was when sent ("Maruti Swift"), and its body type.
  "vehicle_label" varchar(120) NOT NULL,
  "vehicle_type" varchar(20) NOT NULL,
  -- Where it was sent from, rounded on the phone (~110 m), and its area's name.
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "area" varchar(80),
  -- "What happened?" in the customer's words.
  "note" varchar(140) NOT NULL,
  -- What garages read: the brief (the AI's, edited or written by hand), the
  -- part of the car, the damage in a few words, and the box on one image.
  "brief" varchar(240) NOT NULL,
  "damage_area" varchar(80),
  "damage_label" varchar(60),
  "brief_source" varchar(20) NOT NULL,
  "box" jsonb,
  "video_key" varchar(300),
  "video_secs" smallint,
  -- [{ key, kind: 'photo' | 'frame' }]: the customer's photos and the frames
  -- taken from the video on the phone, in the order the brief's box counts.
  "photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "closes_at" timestamp with time zone NOT NULL,
  "booked_quote_id" uuid,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "repair_quote_requests_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "repair_quote_requests_vehicle_id_user_vehicles_id_fk"
    FOREIGN KEY ("vehicle_id") REFERENCES "public"."user_vehicles"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "repair_quote_requests_vehicle_type_check"
    CHECK ("vehicle_type" IN ('hatchback', 'sedan', 'suv')),
  CONSTRAINT "repair_quote_requests_status_check"
    CHECK ("status" IN ('open', 'booked', 'cancelled')),
  CONSTRAINT "repair_quote_requests_brief_source_check"
    CHECK ("brief_source" IN ('ai', 'ai_edited', 'customer')),
  CONSTRAINT "repair_quote_requests_note_check" CHECK (char_length(btrim("note")) BETWEEN 1 AND 140),
  CONSTRAINT "repair_quote_requests_brief_check" CHECK (char_length(btrim("brief")) BETWEEN 1 AND 240),
  CONSTRAINT "repair_quote_requests_video_secs_check"
    CHECK ("video_secs" IS NULL OR ("video_key" IS NOT NULL AND "video_secs" BETWEEN 1 AND 30)),
  -- Something to look at: a video or at least one picture.
  CONSTRAINT "repair_quote_requests_media_check"
    CHECK ("video_key" IS NOT NULL OR jsonb_array_length("photos") > 0),
  -- The quote it was booked from; cleared (the request stays booked) only if
  -- that garage is deleted forever.
  CONSTRAINT "repair_quote_requests_booked_check"
    CHECK ("booked_quote_id" IS NULL OR "status" = 'booked'),
  CONSTRAINT "repair_quote_requests_cancelled_check"
    CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL))
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "repair_quote_requests_user_idx"
  ON "repair_quote_requests" ("user_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repair_quote_requests_created_idx"
  ON "repair_quote_requests" ("created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "repair_quotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "vendor_id" uuid NOT NULL,
  -- How far the garage is from where the request was sent, as the list says it.
  "distance_km" numeric(6, 1) NOT NULL,
  -- 4 of the garage's working hours from when it was asked (lib/repair-quotes.ts).
  "respond_by" timestamp with time zone NOT NULL,
  "status" varchar(20) DEFAULT 'waiting' NOT NULL,
  -- "Can do": the estimate in whole rupees, days needed, whether it must see
  -- the car first, and an optional note for the customer.
  "price_from" integer,
  "price_to" integer,
  "days" smallint,
  "needs_inspection" boolean,
  "note" varchar(200),
  -- "Can't do": an optional reason the customer reads.
  "decline_reason" varchar(200),
  "answered_at" timestamp with time zone,
  "answered_by" uuid,
  -- The visit booked from this quote (a "price on inspection" booking).
  "booking_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "repair_quotes_request_id_repair_quote_requests_id_fk"
    FOREIGN KEY ("request_id") REFERENCES "public"."repair_quote_requests"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "repair_quotes_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "repair_quotes_answered_by_users_id_fk"
    FOREIGN KEY ("answered_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "repair_quotes_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "repair_quotes_status_check"
    CHECK ("status" IN ('waiting', 'quoted', 'declined')),
  CONSTRAINT "repair_quotes_answer_check"
    CHECK (("status" = 'waiting') = ("answered_at" IS NULL)),
  CONSTRAINT "repair_quotes_quoted_check"
    CHECK (
      ("status" = 'quoted') = (
        "price_from" IS NOT NULL AND "price_to" IS NOT NULL
        AND "days" IS NOT NULL AND "needs_inspection" IS NOT NULL
      )
    ),
  CONSTRAINT "repair_quotes_price_check"
    CHECK ("price_from" IS NULL OR ("price_from" > 0 AND "price_to" >= "price_from" AND "price_to" <= 500000)),
  CONSTRAINT "repair_quotes_days_check" CHECK ("days" IS NULL OR "days" BETWEEN 1 AND 30),
  CONSTRAINT "repair_quotes_booking_check" CHECK ("booking_id" IS NULL OR "status" = 'quoted')
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "repair_quotes_request_vendor_key"
  ON "repair_quotes" ("request_id", "vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repair_quotes_vendor_idx"
  ON "repair_quotes" ("vendor_id", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "repair_quotes_booking_id_key"
  ON "repair_quotes" ("booking_id") WHERE "booking_id" IS NOT NULL;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'repair_quote_requests_booked_quote_id_repair_quotes_id_fk'
  ) THEN
    ALTER TABLE "repair_quote_requests"
      ADD CONSTRAINT "repair_quote_requests_booked_quote_id_repair_quotes_id_fk"
      FOREIGN KEY ("booked_quote_id") REFERENCES "public"."repair_quotes"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
