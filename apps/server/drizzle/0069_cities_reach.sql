-- Cities, garage visibility by city, and doorstep / pickup "All over the city"
-- (owner request, 10 Nov 2026).
--
-- `cities`: the cities Detlio serves, each with a centre, a reach in km from
-- that centre, and the owner's switch "Customers see garages here".
--
-- A garage's city is stored in `vendors.city_id`, and only the database
-- writes it (triggers below), by lib/cities.ts cityOfGarage's rule: with a
-- pin, the nearest centre whose reach holds it (name breaks a tie); with no
-- pin, the city its own city field names (trimmed, any case, Madras is
-- Chennai); otherwise NULL ("Other towns"). A garage write that touches the
-- pin or the city field sets it (every write path: admin, the garage's own
-- edits, onboarding, imports, branches, seeds), and any change to `cities`
-- recomputes every garage in one UPDATE. So the customer lists read a garage's
-- city by primary key instead of searching the cities for every row, which
-- PostgreSQL 16's planner turned into a list query of seconds (PR #122's CI).
--
-- Seeded with Chennai at the same centre and reach as SERVICE_CITY
-- (lib/service-city.ts), switched on. Garages in no city ("Other towns") are
-- shown unless admin turns that off ('other_towns_visible' below, absent =
-- shown). So with this file applied and nobody touching the Cities page,
-- every garage listed today stays listed.
--
-- Additive only: every new column has a default or is nullable, and the old
-- API never reads them. The old API's garage writes set city_id through the
-- trigger like any other.

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

-- The centre as a geography, made once per city rather than rebuilt for
-- every garage a query reads (ST_MakePoint takes longitude first).
ALTER TABLE "cities" ADD COLUMN IF NOT EXISTS "centre" gis.geography(Point, 4326)
  GENERATED ALWAYS AS (gis.ST_SetSRID(gis.ST_MakePoint("lng", "lat"), 4326)::gis.geography) STORED;--> statement-breakpoint

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
  CHECK ("key" IN ('garage_target', 'colour_names', 'other_towns_visible'));--> statement-breakpoint

-- ─── The garage's city, stored ───────────────────────────────────────────────

-- NULL is Other towns. Deleting a city empties it at once, and the
-- recompute below then moves those garages to whichever city holds them now.
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "city_id" uuid
  REFERENCES "cities" ("id") ON DELETE SET NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vendors_city_id_idx" ON "vendors" ("city_id");--> statement-breakpoint

-- The rule, lib/cities.ts cityOfGarage, over the garage's own facts. On the
-- sphere (use_spheroid false), as every coverage test in
-- vendors.predicates.ts. The name key is lib/cities.ts cityNameKey. Tables
-- are schema-qualified because it runs from triggers, whatever the caller's
-- search_path.
CREATE OR REPLACE FUNCTION "garage_city_of"(garage_lat double precision, garage_lng double precision, garage_city text)
RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT c."id"
    FROM public."cities" c
   WHERE CASE
           WHEN garage_lat IS NOT NULL AND garage_lng IS NOT NULL
             THEN gis.ST_DWithin(c."centre", gis.ST_SetSRID(gis.ST_MakePoint(garage_lng, garage_lat), 4326)::gis.geography, c."reach_km" * 1000, false)
           ELSE (CASE WHEN lower(btrim(garage_city)) = 'madras' THEN 'chennai' ELSE lower(btrim(garage_city)) END)
              = (CASE WHEN lower(btrim(c."name")) = 'madras' THEN 'chennai' ELSE lower(btrim(c."name")) END)
         END
   ORDER BY CASE
              WHEN garage_lat IS NOT NULL AND garage_lng IS NOT NULL
                THEN gis.ST_Distance(c."centre", gis.ST_SetSRID(gis.ST_MakePoint(garage_lng, garage_lat), 4326)::gis.geography, false)
            END,
            c."name"
   LIMIT 1
$$;--> statement-breakpoint

-- Every garage write that touches the pin or the city field. `geo` is
-- generated from lat/lng after BEFORE triggers run, so the rule reads
-- lat/lng. Nothing else writes city_id (the recompute below sets only it, so
-- it does not fire this).
CREATE OR REPLACE FUNCTION "vendors_set_city_id"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."city_id" := public."garage_city_of"(NEW."lat", NEW."lng", NEW."city");
  RETURN NEW;
END
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS "vendors_set_city_id" ON "vendors";--> statement-breakpoint

CREATE TRIGGER "vendors_set_city_id"
  BEFORE INSERT OR UPDATE OF "lat", "lng", "city" ON "vendors"
  FOR EACH ROW EXECUTE FUNCTION "vendors_set_city_id"();--> statement-breakpoint

-- A city added, moved, resized, renamed or deleted: every garage's city again,
-- in one UPDATE that writes only the rows that change (a few hundred garages
-- read; the cities are a handful).
--
-- The lock closes a race: a garage saved while a city change is uncommitted
-- would not see the new city, nor would the recompute see the garage. SHARE
-- ROW EXCLUSIVE waits for garage writes already under way (so the recompute
-- sees them) and holds new ones until this commits (their trigger, a fresh
-- snapshot per statement, then sees the city). City changes are rare admin
-- actions of a few milliseconds; nothing writes cities after vendors in one
-- transaction, so it cannot deadlock.
CREATE OR REPLACE FUNCTION "cities_recompute_garage_cities"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  LOCK TABLE public."vendors" IN SHARE ROW EXCLUSIVE MODE;
  UPDATE public."vendors" v
     SET "city_id" = fresh."city_id"
    FROM (SELECT "id", public."garage_city_of"("lat", "lng", "city") AS "city_id" FROM public."vendors") fresh
   WHERE fresh."id" = v."id"
     AND v."city_id" IS DISTINCT FROM fresh."city_id";
  RETURN NULL;
END
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS "cities_recompute_garage_cities" ON "cities";--> statement-breakpoint

CREATE TRIGGER "cities_recompute_garage_cities"
  AFTER INSERT OR UPDATE OR DELETE ON "cities"
  FOR EACH STATEMENT EXECUTE FUNCTION "cities_recompute_garage_cities"();--> statement-breakpoint

-- Every garage there is today (Chennai was seeded above, before the trigger).
UPDATE "vendors"
   SET "city_id" = "garage_city_of"("lat", "lng", "city")
 WHERE "city_id" IS DISTINCT FROM "garage_city_of"("lat", "lng", "city");
