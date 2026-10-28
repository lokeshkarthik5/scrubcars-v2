-- Customer reach, part 1: Chennai's zones (owner, 28 Oct 2026: "the landing
-- page becomes the app"; location is asked as an area chip, never a cold
-- GPS popup).
--
--   - `zones`: an area of Chennai as a centre and a name. A point (a
--     garage's pin, a customer's area) belongs to the nearest zone centre
--     within 6 km, and to no zone otherwise (`zoneFor`,
--     apps/server/src/lib/zones.ts). Nothing is drawn and no garage stores
--     its zone: it is worked out from the pin on read.
--   - `priority`: the owner's seven priority areas, the landing page's
--     chips. `target`: how many listed garages the team wants in the zone
--     (5 until admin edits zones, PR 5). `live_at`: when the zone first had
--     a live garage, set by the next part of this release (launch day);
--     null until then.
--   - Seeded with the owner's 25 areas. The same list is in
--     apps/server/src/lib/zones.ts (CHENNAI_ZONES; zones.test.ts holds this
--     file to it) and in the customer app's fallback
--     (packages/core/src/zones.ts, zones.parity.test.ts).
--
-- No personal data. Additive: a new table and its rows. Applied by
-- scripts/migrate.sh in one transaction; every statement is safe to re-run.

CREATE TABLE IF NOT EXISTS "zones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(60) NOT NULL,
  "name" varchar(60) NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "priority" boolean DEFAULT false NOT NULL,
  "target" integer DEFAULT 5 NOT NULL,
  "live_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "zones_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT "zones_name_check" CHECK (length(btrim("name")) BETWEEN 2 AND 60),
  CONSTRAINT "zones_lat_check" CHECK ("lat" BETWEEN -90 AND 90),
  CONSTRAINT "zones_lng_check" CHECK ("lng" BETWEEN -180 AND 180),
  CONSTRAINT "zones_target_check" CHECK ("target" BETWEEN 1 AND 1000)
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "zones_slug_key" ON "zones" ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "zones_name_key" ON "zones" (lower("name"));--> statement-breakpoint

INSERT INTO "zones" ("slug", "name", "lat", "lng", "priority")
VALUES
  ('adyar', 'Adyar', 13.0012, 80.2565, true),
  ('nungambakkam', 'Nungambakkam', 13.0569, 80.2425, true),
  ('anna-nagar', 'Anna Nagar', 13.085, 80.2101, true),
  ('sholinganallur', 'Sholinganallur', 12.901, 80.2279, true),
  ('navalur', 'Navalur', 12.8459, 80.2265, true),
  ('guindy', 'Guindy', 13.0067, 80.2206, true),
  ('t-nagar', 'T Nagar', 13.0418, 80.2341, true),
  ('velachery', 'Velachery', 12.9815, 80.218, false),
  ('mylapore', 'Mylapore', 13.0368, 80.2676, false),
  ('kilpauk', 'Kilpauk', 13.085, 80.242, false),
  ('egmore', 'Egmore', 13.0732, 80.2609, false),
  ('porur', 'Porur', 13.0382, 80.1565, false),
  ('vadapalani', 'Vadapalani', 13.05, 80.2121, false),
  ('kodambakkam', 'Kodambakkam', 13.0524, 80.2255, false),
  ('chromepet', 'Chromepet', 12.9516, 80.1462, false),
  ('tambaram', 'Tambaram', 12.9249, 80.1, false),
  ('pallikaranai', 'Pallikaranai', 12.9349, 80.2137, false),
  ('medavakkam', 'Medavakkam', 12.9171, 80.1923, false),
  ('perungudi', 'Perungudi', 12.9654, 80.2461, false),
  ('thiruvanmiyur', 'Thiruvanmiyur', 12.983, 80.2594, false),
  ('ambattur', 'Ambattur', 13.1143, 80.1548, false),
  ('perambur', 'Perambur', 13.121, 80.2329, false),
  ('royapettah', 'Royapettah', 13.054, 80.264, false),
  ('kotturpuram', 'Kotturpuram', 13.02, 80.2415, false),
  ('ashok-nagar', 'Ashok Nagar', 13.0359, 80.2121, false)
ON CONFLICT ("slug") DO NOTHING;
