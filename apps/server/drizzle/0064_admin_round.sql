-- The admin round (owner, 28 Oct 2026; ADMIN-FIXES-BACKLOG "PR 5 · Admin",
-- part 1).
--
-- Changes:
--
--   - `services.duration_mins` may be empty. An empty duration blocks the
--     default 60 minutes in the slot calendar (lib/service-duration.ts
--     effectiveDurationMins); every booking keeps writing the effective
--     number into its own snapshot, never null. Admin flags "Duration not
--     set".
--   - `services.commission_rate`: an optional percent (0 to 50) that
--     replaces the category's rate (lib/commission.ts) in Statistics. Empty
--     is the category's rate. Reporting only: payouts keep the category
--     rates.
--   - `vendors.colour_tag` (green / amber / red / blue, or none) with
--     `colour_tag_call_on` (a "Call back" day, blue only),
--     `colour_tag_set_by` and `colour_tag_set_at`: the team's own colour for
--     a garage on the Garages list. Nothing sets it automatically.
--   - `vendor_onboarding_marks.items`: a mark's checklist, a JSON array of
--     `{ id, text, done, answer, answeredBy, answeredAt }`. Empty for every
--     existing mark; a note's "- " lines are read as items until the mark is
--     next changed (lib/mark-checklist.ts).
--   - `admin_settings`: team-wide admin settings by key ("garage_target",
--     "colour_names"), with who changed them and when.
--   - `leads` (part 2, Coverage & leads): a garage the team wants to sign
--     up. Customers never see leads. The name and phone the team typed or
--     confirmed are ours; what came from Google is held apart in `google_*`
--     with `google_fetched_at`, refreshed or cleared after 30 days by the
--     cron (Google's terms; lib/places/refresh.ts). `zone_id` is worked out
--     from the pin by the zones' one rule (lib/zones.ts zoneFor), or is the
--     zone a pin-less lead was added in; a zone with leads cannot be removed
--     (RESTRICT). `vendor_id` is the garage it became.
--
-- `vendors.address` stays NOT NULL: a doorstep-only garage may now keep it
-- empty (''), which every reader already handles as text.
--
-- Additive: the code in production writes every duration and never reads
-- the new columns.
ALTER TABLE "services" ALTER COLUMN "duration_mins" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "commission_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_commission_rate_check"
  CHECK ("commission_rate" IS NULL OR ("commission_rate" >= 0 AND "commission_rate" <= 50));--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "colour_tag" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "colour_tag_call_on" date;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "colour_tag_set_by" varchar(100);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "colour_tag_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_colour_tag_check"
  CHECK ("colour_tag" IS NULL OR "colour_tag" IN ('green', 'amber', 'red', 'blue'));--> statement-breakpoint
-- A call-back day only on a Call back tag.
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_colour_tag_call_on_check"
  CHECK ("colour_tag_call_on" IS NULL OR "colour_tag" = 'blue');--> statement-breakpoint
ALTER TABLE "vendor_onboarding_marks" ADD COLUMN IF NOT EXISTS "items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_onboarding_marks" ADD CONSTRAINT "vendor_onboarding_marks_items_check"
  CHECK (jsonb_typeof("items") = 'array' AND jsonb_array_length("items") <= 30);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "updated_by_name" varchar(100) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_settings_key_check" CHECK ("key" IN ('garage_target', 'colour_names')),
  CONSTRAINT "admin_settings_value_check" CHECK (jsonb_typeof("value") = 'object')
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(120),
  "phone" varchar(15),
  "address" varchar(300),
  "maps_url" text,
  "lat" double precision,
  "lng" double precision,
  "pin_source" text,
  "zone_id" uuid,
  "source" text NOT NULL,
  "status" text DEFAULT 'to_target' NOT NULL,
  "not_interested_reason" varchar(200),
  "not_interested_on" date,
  "retry_after" date,
  "assigned_login_id" uuid,
  "assigned_name" varchar(100),
  "last_note" text,
  "last_note_by" varchar(100),
  "last_note_at" timestamp with time zone,
  "vendor_id" uuid,
  "onboarded_at" timestamp with time zone,
  "google_place_id" varchar(300),
  "ola_place_id" varchar(300),
  "google_name" varchar(200),
  "google_phone" varchar(15),
  "google_address" varchar(300),
  "google_rating" numeric(2, 1),
  "google_review_count" integer,
  "google_fetched_at" timestamp with time zone,
  "created_by_name" varchar(100) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "leads_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT,
  CONSTRAINT "leads_assigned_login_id_fk" FOREIGN KEY ("assigned_login_id") REFERENCES "admin_logins"("id") ON DELETE SET NULL,
  CONSTRAINT "leads_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL,
  CONSTRAINT "leads_source_check" CHECK ("source" IN ('manual', 'paste', 'google', 'ola', 'customer')),
  CONSTRAINT "leads_status_check" CHECK ("status" IN ('to_target', 'not_interested', 'onboarded')),
  CONSTRAINT "leads_pin_source_check" CHECK ("pin_source" IS NULL OR "pin_source" IN ('maps_link', 'map', 'google', 'ola')),
  -- A name the team typed or confirmed, or (only for a Google lead) none
  -- yet: the screen then shows Google's, while it is fresh.
  CONSTRAINT "leads_name_check" CHECK (
    ("name" IS NULL AND "google_place_id" IS NOT NULL) OR length(btrim("name")) BETWEEN 1 AND 120
  ),
  CONSTRAINT "leads_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^[0-9]{6,15}$'),
  CONSTRAINT "leads_google_phone_check" CHECK ("google_phone" IS NULL OR "google_phone" ~ '^[0-9]{6,15}$'),
  CONSTRAINT "leads_pin_check" CHECK (
    ("lat" IS NULL AND "lng" IS NULL AND "pin_source" IS NULL)
    OR ("lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180 AND "pin_source" IS NOT NULL)
  ),
  -- Not interested always says why and since when; nothing else keeps them.
  CONSTRAINT "leads_not_interested_check" CHECK (
    ("status" = 'not_interested') = ("not_interested_reason" IS NOT NULL AND "not_interested_on" IS NOT NULL)
  ),
  CONSTRAINT "leads_retry_after_check" CHECK ("retry_after" IS NULL OR "status" = 'not_interested'),
  CONSTRAINT "leads_note_check" CHECK ("last_note" IS NULL OR char_length("last_note") <= 500),
  CONSTRAINT "leads_google_rating_check" CHECK ("google_rating" IS NULL OR "google_rating" BETWEEN 0 AND 5),
  CONSTRAINT "leads_google_review_count_check" CHECK ("google_review_count" IS NULL OR "google_review_count" >= 0),
  -- Anything from Google carries the day it was read.
  CONSTRAINT "leads_google_fetched_check" CHECK (
    "google_fetched_at" IS NOT NULL OR (
      "google_name" IS NULL AND "google_phone" IS NULL AND "google_address" IS NULL
      AND "google_rating" IS NULL AND "google_review_count" IS NULL
    )
  )
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_zone_id_idx" ON "leads" ("zone_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_phone_idx" ON "leads" ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_google_fetched_at_idx" ON "leads" ("google_fetched_at") WHERE "google_fetched_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leads_vendor_id_key" ON "leads" ("vendor_id") WHERE "vendor_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leads_google_place_id_key" ON "leads" ("google_place_id") WHERE "google_place_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leads_ola_place_id_key" ON "leads" ("ola_place_id") WHERE "ola_place_id" IS NOT NULL;
