-- Cities, garage visibility by city, and doorstep / pickup "All over the city"
-- (owner request, 10 Nov 2026).
--
-- `cities`: the cities Detlio serves, each with a centre, a reach in km from
-- that centre, and the owner's switch "Customers see garages here". A
-- garage's city is never stored: it is worked out on read from its pin (the
-- nearest centre whose reach holds it) or, with no pin, from its own city
-- field (lib/cities.ts, GARAGE_CITY in vendors.predicates.ts). So adding,
-- moving or deleting a city changes no garage row.
--
-- Seeded with Chennai at the same centre and reach as SERVICE_CITY
-- (lib/service-city.ts), switched on. Garages in no city ("Other towns") are
-- shown unless admin turns that off ('other_towns_visible' below, absent =
-- shown). So with this file applied and nobody touching the Cities page,
-- every garage listed today stays listed.
--
-- Additive only: every new column has a default, and the old API never reads
-- them.

CREATE TABLE IF NOT EXISTS "cities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(100) NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "reach_km" integer DEFAULT 50 NOT NULL,
  "customers_see" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cities_reach_km_check" CHECK ("reach_km" BETWEEN 1 AND 300),
  CONSTRAINT "cities_centre_check" CHECK ("lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180)
);--> statement-breakpoint

-- One city per name in any case and spacing: "Chennai" and " chennai" are the
-- same city. (Madras, Chennai's old name, is refused by the service too.)
CREATE UNIQUE INDEX IF NOT EXISTS "cities_name_key" ON "cities" (lower(btrim("name")));--> statement-breakpoint

-- Chennai, as SERVICE_CITY has it. Skipped when it is already there, so the
-- file can run twice.
INSERT INTO "cities" ("name", "lat", "lng", "reach_km", "customers_see")
SELECT 'Chennai', 13.0827, 80.2707, 50, true
WHERE NOT EXISTS (SELECT 1 FROM "cities" WHERE lower(btrim("name")) IN ('chennai', 'madras'));--> statement-breakpoint

-- "Show this garage anyway": keeps one garage in front of customers while its
-- city (or Other towns) is off.
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "show_when_city_off" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- "All over <city>" for doorstep and for pickup & drop: the garage covers
-- every address inside its city's reach instead of its own radius.
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "doorstep_whole_city" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_whole_city" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- The Other towns switch lives with the other team-wide settings: one more
-- key in admin_settings' CHECK. Dropped and added again, since a CHECK cannot
-- be changed in place.
ALTER TABLE "admin_settings" DROP CONSTRAINT IF EXISTS "admin_settings_key_check";--> statement-breakpoint
ALTER TABLE "admin_settings" ADD CONSTRAINT "admin_settings_key_check"
  CHECK ("key" IN ('garage_target', 'colour_names', 'other_towns_visible'));
