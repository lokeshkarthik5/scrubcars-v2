-- Geolocation foundation: PostGIS, real float8 coordinates, and an indexed
-- spatial column per table that gets searched.
--
-- See plans/geo.md for the reasoning. The three decisions this file encodes:
--
-- 1. PostGIS lives in a dedicated `gis` schema, not `public`. PostGIS 2.3+ is
--    NOT relocatable (ALTER EXTENSION ... SET SCHEMA is refused), so this is a
--    one-way door: changing it later means dropping the extension along with
--    every dependent column, index and generated expression. `gis` is what
--    Supabase's own dashboard flow creates and what its `extension_in_public`
--    linter wants, so it is the tested upgrade/restore path.
--
-- 2. lat/lng stay the source of truth as plain float8 columns, and the spatial
--    column is GENERATED from them. Every existing write path keeps working
--    untouched, there is no EWKB serialisation in the ORM, and the two can
--    never drift the way a trigger-maintained column can.
--
-- 3. No coordinate is ever guessed. Placeholder rows are nulled out rather than
--    backfilled by geocoding — a guess is indistinguishable from a real pin
--    once it is in the index. Garages without a pin are kept out of listings by
--    the verification gate instead (see geo_source / geo_confirmed_at below).
--
-- Existing rows: every lat/lng in the database today is the same hardcoded
-- Chennai placeholder written by the client forms, so nulling them loses
-- nothing real.

CREATE SCHEMA IF NOT EXISTS gis;--> statement-breakpoint

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA gis;--> statement-breakpoint

-- Note on search_path: nothing below relies on one. Every PostGIS type,
-- function and cast in this file is schema-qualified (gis.geography,
-- gis.ST_MakePoint, ::gis.geography), and so is every runtime query in
-- vendors.repository.ts. That is deliberate — Supabase's pooler does not
-- reliably carry a session-level search_path in transaction mode, so relying on
-- one would work in psql and fail in production.
--
-- Purely for ad-hoc psql ergonomics, run by hand with the real role name:
--   ALTER ROLE <app_db_role> SET search_path = "$user", public, gis;

-- ─── 1. float4 → float8 ──────────────────────────────────────────────────────
-- real (float4) carries ~7 significant digits, which is ~1 m of achievable
-- precision at Indian latitudes and rounds badly under arithmetic. Coordinates
-- should be float8. This rewrites the tables, which is why it happens now
-- rather than at scale.

ALTER TABLE "vendors"
  ALTER COLUMN "lat" TYPE double precision,
  ALTER COLUMN "lng" TYPE double precision;--> statement-breakpoint

ALTER TABLE "user_addresses"
  ALTER COLUMN "lat" TYPE double precision,
  ALTER COLUMN "lng" TYPE double precision;--> statement-breakpoint

ALTER TABLE "bookings"
  ALTER COLUMN "lat" TYPE double precision,
  ALTER COLUMN "lng" TYPE double precision;--> statement-breakpoint

ALTER TABLE "booking_intents"
  ALTER COLUMN "lat" TYPE double precision,
  ALTER COLUMN "lng" TYPE double precision;--> statement-breakpoint

-- ─── 2. Drop the placeholder coordinates ─────────────────────────────────────
-- 13.0067 / 80.2574 is the hardcoded Chennai default the customer address form
-- and the vendor onboarding store have been writing for every row. An honest
-- NULL beats a confident lie that puts every garage on one street corner.
--
-- Matched with a tolerance, NOT equality. The columns were float4 until step 1
-- above, and widening float4 -> float8 does not produce the float8 literal:
-- 13.0067 stored as float4 and widened reads back as 13.006699562072754. An
-- `= 13.0067::double precision` test therefore matches nothing, and every
-- placeholder row would survive the purge.
--
-- 1e-5 degrees is roughly a metre — comfortably wider than the ~4.4e-7 float4
-- artifact, and far tighter than any two genuinely distinct pins.

UPDATE "vendors"
   SET "lat" = NULL, "lng" = NULL
 WHERE abs("lat" - 13.0067) < 1e-5
   AND abs("lng" - 80.2574) < 1e-5;--> statement-breakpoint

-- An address with text but no pin is a legitimate state from here on: it is
-- perfectly usable for a drop-in booking and only needs coordinates when the
-- customer picks it for doorstep. So the NOT NULL goes.
ALTER TABLE "user_addresses"
  ALTER COLUMN "lat" DROP NOT NULL,
  ALTER COLUMN "lng" DROP NOT NULL;--> statement-breakpoint

UPDATE "user_addresses"
   SET "lat" = NULL, "lng" = NULL
 WHERE abs("lat" - 13.0067) < 1e-5
   AND abs("lng" - 80.2574) < 1e-5;--> statement-breakpoint

-- ─── 3. Generated spatial columns + GiST indexes ─────────────────────────────
-- geography (not geometry) so ST_Distance returns metres and ST_DWithin takes
-- metres — no degrees-vs-kilometres bug class. Note the lng/lat argument order
-- of ST_MakePoint: it is (x, y), which is longitude first.

ALTER TABLE "vendors"
  ADD COLUMN "geo" gis.geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN "lat" IS NOT NULL AND "lng" IS NOT NULL
      THEN gis.ST_SetSRID(gis.ST_MakePoint("lng", "lat"), 4326)::gis.geography
    END
  ) STORED;--> statement-breakpoint

CREATE INDEX "vendors_geo_idx" ON "vendors" USING GIST ("geo");--> statement-breakpoint

-- Partial index matching the public listing predicate, so the KNN walk only
-- ever touches rows a customer could actually see.
CREATE INDEX "vendors_geo_listable_idx" ON "vendors" USING GIST ("geo")
  WHERE "status" = 'active' AND "is_verified" = true;--> statement-breakpoint

ALTER TABLE "user_addresses"
  ADD COLUMN "geo" gis.geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN "lat" IS NOT NULL AND "lng" IS NOT NULL
      THEN gis.ST_SetSRID(gis.ST_MakePoint("lng", "lat"), 4326)::gis.geography
    END
  ) STORED;--> statement-breakpoint

CREATE INDEX "user_addresses_geo_idx" ON "user_addresses" USING GIST ("geo");--> statement-breakpoint

-- ─── 4. Doorstep coverage radius ─────────────────────────────────────────────
-- How far this garage is willing to travel. Deliberately distinct from
-- pickup_radius_km, which is pickup-and-drop of the vehicle, not doorstep
-- service at the customer's location.
--
-- This is the vendor's number, not the customer's: the doorstep listing asks
-- "who will come to me", so a detailer willing to drive 25 km shows up for a
-- customer that a 3 km wash place would not serve.

ALTER TABLE "vendors" ADD COLUMN "doorstep_radius_km" double precision;--> statement-breakpoint

-- ─── 5. Coordinate provenance ────────────────────────────────────────────────
-- Where a pin came from, and whether a human has ever confirmed it. These drive
-- the "set your garage location" task on the vendor dashboard and the admin
-- verification gate: is_verified cannot be set while geo IS NULL, which is what
-- keeps coordinate-less garages out of customer-facing listings without any
-- special case in the listing query itself.
--
-- 'geocoded' is unused today by design (no backfill). It exists for a future
-- bulk partner import, where it is precisely the marker saying "these rows
-- still need a human pass".

CREATE TYPE "public"."geo_source" AS ENUM('unset', 'gps', 'map_pin', 'geocoded', 'admin');--> statement-breakpoint

ALTER TABLE "vendors"
  ADD COLUMN "geo_source" "public"."geo_source" DEFAULT 'unset' NOT NULL;--> statement-breakpoint

ALTER TABLE "vendors" ADD COLUMN "geo_confirmed_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "user_addresses"
  ADD COLUMN "geo_source" "public"."geo_source" DEFAULT 'unset' NOT NULL;--> statement-breakpoint

-- Anything that still has coordinates after the placeholder purge above got
-- them from somewhere real (seeds, manual admin entry). Mark it as admin-set
-- rather than leaving it indistinguishable from 'never set'.
UPDATE "vendors" SET "geo_source" = 'admin' WHERE "lat" IS NOT NULL;--> statement-breakpoint
UPDATE "user_addresses" SET "geo_source" = 'admin' WHERE "lat" IS NOT NULL;
--> statement-breakpoint

-- ─── 6. Geocoding response cache ─────────────────────────────────────────────
-- The provider proxy (server/src/modules/geo) caches here rather than in
-- process memory, because the API runs serverless: an in-process cache would be
-- cold on most requests and would multiply by instance count, which is the
-- opposite of what a free-tier budget wants.
--
-- The key is "{provider}:{op}:{normalised-input}". It includes the provider
-- name deliberately — swapping providers must not serve rows shaped by the old
-- one. Reverse-geocode keys round coordinates to 4 decimals (~11 m), which
-- collapses everyone in one apartment block onto a single entry.
--
-- TTL is enforced on read against created_at, so expiry needs no scheduler;
-- a periodic DELETE is only ever housekeeping.

CREATE TABLE "geo_cache" (
	"cache_key" varchar(512) PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX "geo_cache_created_at_idx" ON "geo_cache" ("created_at");
