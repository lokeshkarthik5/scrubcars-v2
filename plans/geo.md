# Geolocation & Maps — Detlio implementation plan

Status: **All phases implemented and migration-tested (2026-08-28).
Migrations written and validated locally, but NOT applied to your database.
Envs not yet set — see `server/.env.example` and `web/.env.example`.**

### What is built

| Phase | State |
|---|---|
| 0 — PostGIS foundation | ✅ `0019_add_geo.sql`. Replayed against a local PostGIS 3.6 database, not yet applied to Supabase |
| 1 — Garage coordinates | ✅ Provider adapter, `/geo/*` proxy, map picker, onboarding, admin, pin-required-to-verify |
| 2 — Customer location + distance | ✅ Location store, permission UX, `distanceKm`, "Nearest First" |
| 3 — Server-side sort + pagination | ✅ Filtering/sorting in SQL, cursor pagination, infinite scroll on home and search |
| 4 — Doorstep coverage | ✅ Enforced at booking creation. Unreachable until doorstep booking is enabled — see caveats |
| 5 — Airbnb map view | ✅ `/map`: bbox querying, "search this area", price-pill markers, card↔marker sync |
| 6 — Later-if-justified | ✅ Coverage polygons (`0020`), on-demand travel time, admin demand-vs-supply map |

### Verified against a real database

`0000`–`0020` were replayed on a scratch PostgreSQL 17.7 + PostGIS 3.6.4
instance. What that run confirmed:

- Generated `geo` columns populate; `vendors.lat` is `double precision`;
  `user_addresses.lat` is nullable; all four GiST indexes exist.
- The placeholder purge works. A garage stored at the old hardcoded
  `13.0067/80.2574` is nulled; a real one is kept.
- Distances are correct in metres (Adyar→Velachery 4,536 m; →Anna Nagar
  10,191 m), and the KNN order matches.
- `EXPLAIN` shows `Index Scan using vendors_geo_listable_idx` with
  `Order By: (geo OPERATOR(gis.<->) …)` — index-ordered nearest-neighbour, not
  a sort. This is the scalability claim, and it holds.
- Polygon coverage overrides the radius: the Adyar polygon covers Adyar and
  excludes Anna Nagar, while a 3 km-radius garage correctly refuses a 4.5 km
  address.
- `geo_cache` hits inside its TTL and misses outside it.
- The demand/supply aggregation reports `gap=2` for a cell with two doorstep
  bookings and no garage.

**Two real bugs were caught this way, both of which would have shipped:**

1. **The placeholder purge never matched.** It was written as
   `WHERE lat = 13.0067::double precision`, running *after* the float4→float8
   widening — but a float4 `13.0067` widened reads back as `13.006699562072754`,
   so the equality matched nothing and every placeholder row survived. Now a
   1e-5 tolerance, which is far above the ~4.4e-7 float artifact and far below
   any two genuinely distinct pins.

2. **`<->` and `&&` did not resolve at all.** PostGIS lives in `gis`, and an
   infix operator cannot take a `gis.` prefix the way a function can — it needs
   `OPERATOR(gis.<->)`. Every distance-sorted listing and every map bbox query
   would have failed at runtime with *"operator does not exist"*. This is the
   sharp edge of the schema decision, and it is now spelled correctly in
   `vendors.repository.ts` with a comment saying why.

### Before this runs

1. **Apply the migrations**: `cd server && npm run migrate`. `0019` creates the
   `gis` schema and the PostGIS extension, so it needs a role that can
   `CREATE EXTENSION` — on Supabase that is `postgres`, which `DIRECT_URL`
   already uses.
2. **Copy the env templates** and fill them in:
   `cp server/.env.example server/.env` and `cp web/.env.example web/.env`.
   Only `OLA_MAPS_API_KEY` is new and needed; everything else has a default.
   Without it, `/geo/*` returns a clean 503 and the map picker still works as a
   plain drop-a-pin — the pin is the source of truth for coordinates, and
   geocoding only prefills the address text.
3. **Verify Ola's wire format.** `server/src/lib/geo/ola.ts` parses their
   documented Google-Places-compatible shape, but the full schema is not
   published. Confirm the field names against a live key and correct
   `normalisePlace` / `pickList` — they are the only place the wire format is
   known, and everything above them is shape-agnostic.

### Unpinned garages stay visible

Most garages predate the map picker, and `0019` nulls the placeholder
coordinates they were carrying — so the listing had to answer for a large
population with no pin at all. Hiding them would have been the worst possible
regression: a geo filter they cannot satisfy empties the listing for a city
full of garages.

Two things make that safe:

1. **`GEO_REQUIRE_PIN`** (default `false`) controls whether an admin may verify
   a garage without coordinates. The end state is `true` — an unpinned garage
   cannot be found nearby, cannot be distance-sorted and cannot be
   coverage-checked — but a hard gate today would block every verification
   until the whole backlog is revisited. Flip it on once the admin list's
   "Not pinned" queue is clear.

2. **`includeUnlocated`** (default `true`) appends garages with no coordinates
   *after* the located ones, rather than mixing them in. There is no honest way
   to rank a garage whose distance is unknown against one 800 m away, so the
   list is really two lists and the UI says so at the boundary ("Other garages
   — location not set yet"). The map view passes `false`: a garage with no
   coordinates cannot be drawn on a map.

The two segments are read as **separate queries**, not as one query with
`ORDER BY (geo IS NULL), geo <-> point`. A leading non-geo sort key defeats the
KNN index scan, and Postgres would fall back to sorting the whole candidate
set — losing exactly the property this design exists to protect. The cursor
therefore carries which segment a page continues, since a bare offset could
not say.

Booking-time doorstep coverage is unaffected: a garage with no pin fails
`ST_DWithin` and is refused there regardless of what the listing showed.

### Caveats worth knowing

- **The migrations have not touched your Supabase database.** They are
  validated locally; applying them is still your call.
- **Doorstep booking is disabled at the API.** `createBookingTypeSchema` is
  `z.literal('dropin')`, so the coverage rules — radius, polygon, and the
  address-pin prompt — are written and correct but unreachable. Widening that
  literal is now the only thing between you and doorstep bookings; the rules
  ship with the feature rather than being remembered afterwards. Enabling it is
  a product decision, so it was left alone.
- **Travel time is opt-in per garage.** Routing is the one geo call whose volume
  tracks browsing rather than saves, so it fires only on a garage detail page,
  never for a list, and is cached on rounded coordinates. It degrades to the
  straight-line distance when unavailable.
- **The demand/supply map shows very little until bookings exist.** That is the
  correct output, not a broken one.
- **Distance pagination is offset-backed** behind an opaque cursor, so keyset
  pagination can replace it with no API change.

---

Status of the decisions below: **resolved (2026-08-27).**

Resolved since the first draft — these are folded into the plan below, not
left as questions:

1. **PostGIS lives in a dedicated `gis` schema**, not `public`. §2.
2. **Ola Maps first, behind a provider adapter** so Google / MapmyIndia /
   Geoapify is a one-file swap. §5.
3. **No backfill.** A garage with no pin gets a status and a task to fix it;
   it never gets a guessed coordinate. §7.
4. **Customer addresses re-prompt for a pin.** No users yet, so no migration
   subtlety needed. §7.
5. **Radius: every garage within 50 km, nearest first (owner, 2026-10-16;
   was 10 km with an auto-widen ladder); doorstep uses the *vendor's* radius,
   10 km when it left it empty.** §8.
6. **Airbnb-style split list/map view is the target.** It changes one API
   decision now (bbox), even though the view itself ships later. §8, §9.

Goal: know where the customer is, know where each garage actually is, and sort
and filter garages by real distance — cheaply enough to run on a bootstrap
budget, and without repainting the whole thing when there are 5,000 garages
instead of 50.

This plan covers four separable problems that are easy to conflate:

| # | Problem | Where it lives | Cost profile |
|---|---------|----------------|--------------|
| 1 | **Storing + querying** coordinates and distance | Postgres | free, one-time design cost |
| 2 | **Getting the customer's location** | browser | free (GPS) |
| 3 | **Getting the garage's location** | vendor onboarding + admin | ~one geocode per garage, ever |
| 4 | **Showing a map / turning text into coordinates** | 3rd-party provider | the only real money |

Problems 1 and 2 are essentially free. Problem 4 is where Google Maps would
bill you, and it is entirely avoidable. Problem 3 is the one that decides
whether any of this actually works, because bad garage coordinates poison every
distance sort and every doorstep radius check forever.

---

## 1. Where things stand today

Findings from the current codebase, so the plan is grounded in what exists.

**Coordinates already have columns, but no real data.**

- `vendors.lat` / `vendors.lng` — `real`, **nullable** (`server/src/db/schema.ts:247-248`;
  made nullable in `drizzle/0005_vendor_latlng_nullable.sql`).
- `user_addresses.lat` / `lng` — `real`, `NOT NULL` (`schema.ts:206-207`).
- `bookings.lat` / `lng` / `address` — the doorstep snapshot (`schema.ts:449-451`).

**Nothing populates them honestly.**

- The customer address form hardcodes Chennai for every address it creates:
  `lat: 13.0067, lng: 80.2574` — `web/app/profile/page.tsx:155-156`.
- Vendor onboarding does the same, from store defaults —
  `web/lib/stores/vendor-onboarding-store.ts:54-55`, submitted at
  `web/app/vendor/onboarding/step-2/page.tsx:37-38`. Step 2 collects address,
  pincode and a Google Maps **link**, never coordinates.
- The admin vendor form has no lat/lng field at all
  (`web/app/admin/vendors/new/page.tsx:237-242`).
- `detectLocation()` and `resolvePincode()` in `web/lib/api/users.ts:150-165`
  are stubs that return `{ area: 'Chennai', pincode: '600020' }`.

  → **Every coordinate in the database right now is a placeholder.** Treat all
  of it as unset, not as data to preserve.

**There is no distance anywhere in the read path.**

- `listPublicVendors()` returns *all* active+verified vendors with no filter,
  no pagination and no geo, ordered by business name —
  `server/src/modules/vendors/vendors.repository.ts:69-86`.
- Filtering (`q`, `category`, `bookingType`) happens **in JS after the fetch** —
  `vendors.service.ts:417-437`.
- Sorting is **entirely client-side** over the full list — `web/lib/sort-vendors.ts`,
  with options `relevance | rating | price_asc | price_desc`
  (`web/components/sc/sort-sheet.tsx:7`). No distance option.
- The UI already has a distance slot, wired to a placeholder:
  `distance: '—'` in `web/lib/api/mappers.ts:104` and `:130`, rendered behind a
  `hasDistance` guard in `web/components/features/vendor-card.tsx:26,72,91`.

  → The card is ready for a real number; the data path is not.

**Doorstep coverage is declared but never enforced.**

- `vendor_service_areas` (area name + pincode + optional `radius_km`,
  `schema.ts:296-307`) is created, listed and seeded, but **nothing in
  `bookings.service.ts` ever consults it**. A doorstep booking is accepted
  regardless of where the customer is.
- `vendors.pickup_radius_km` exists and is collected at onboarding step 3, but
  is only ever stored and echoed back — never used in a query.
- AGENTS.md states doorstep "require[s] … a matching `vendor_service_areas` row" —
  that rule is currently aspirational. Geo is the natural way to make it true.

**Infrastructure.**

- Postgres is **Supabase** (`aws-1-ap-south-1`, pooled 6543 + direct 5432).
  PostGIS is a first-class, dashboard-enabled extension there, with GiST
  indexing on geometry and geography columns — no self-hosting question.
- Drizzle ORM 0.45, raw-SQL migrations applied by `server/scripts/migrate.sh`,
  latest is `0018_add_booking_intents`. Next is `0019`.
- Web is Next 16 / React 19 / Tailwind v4 / **shadcn already installed**
  (`web/components.json`, `web/components/ui/button.tsx`). No map library yet.

---

## 2. Decision: how to store and query location

### The candidates

| Option | How | Verdict |
|---|---|---|
| **A. PostGIS `geography` + GiST + KNN** | `geography(Point,4326)` column, `ST_DWithin` to filter, `<->` to order | ✅ **Recommended** |
| B. `cube` + `earthdistance` | `ll_to_earth()` in a GiST index, `earth_box()` to filter | Works, but clunky API, no KNN ordering operator, dead end for polygons/coverage |
| C. Bounding box + Haversine in SQL | pre-filter `lat BETWEEN …`, compute `acos(...)` in SQL, sort | No extension needed. Fine to ~10k rows. Can't do coverage areas. Breaks down as a *general* answer |
| D. Geohash prefix / H3 cells | store a cell id, match on prefix | Great for bucketing and cache keys, wrong tool for "nearest N" — edge cases at cell boundaries |

### Recommendation: **A — PostGIS.**

Reasoning, in the order that matters for you:

1. **It's already available.** Supabase ships PostGIS as a supported extension.
   The adoption cost is literally one `CREATE EXTENSION`, one generated column
   per table, one index. There is no infrastructure to run, no service to pay
   for, no ops burden. Options B and C exist to *avoid* PostGIS — you have
   nothing to avoid.

2. **It's the only option that stays correct as you page.** This is the real
   argument, and it's about your read path, not about geometry. Today the
   server returns every vendor and the client sorts. That works at 50 garages
   and is untenable at 5,000 — you cannot ship the whole table to a phone. Once
   sorting moves server-side, "nearest 20, then the next 20" must be a
   *database* operation. `ORDER BY geo <-> $point LIMIT 20` is index-assisted
   nearest-neighbour: Postgres walks the GiST index in distance order and stops
   at 20. Options B, C and D all require scanning the candidate set and sorting
   it. That's the difference between a query that stays flat and one that
   degrades with your garage count.

3. **It's the only option that survives the next three features.** Doorstep
   coverage radius (`ST_DWithin`), irregular service-area polygons a garage
   draws on a map (`ST_Contains`), city/zone boundaries for ops reporting,
   supply-gap heatmaps — all one function call in PostGIS, all a rewrite in
   the others. You said "scalable in the longer run"; this is that.

4. **Distance in metres, correctly, for free.** `geography` does spheroid maths
   natively. `ST_Distance` returns metres, `ST_DWithin` takes metres. No
   degrees-vs-kilometres bug class, which is the single most common way
   home-rolled geo goes wrong.

**Honest counterpoint:** at your current scale, option C would work and cost
nothing to build. If PostGIS were unavailable I would not consider it a
blocker. But it *is* available, and the migration below is ~15 lines. Paying
that now is much cheaper than retrofitting a spatial index onto a live
listing endpoint later.

**Where geohash/H3 does earn a place, later:** as a *cache key* for reverse
geocoding and as a bucketing key for demand analytics ("which 500m cells have
customers but no garages"). Not for the nearest-N query. Noted in §11.

### Schema shape: keep `lat`/`lng`, add a **generated** geography column

Don't replace `lat`/`lng` with a PostGIS type. Keep them as the plain,
readable, Drizzle-native source of truth, and let Postgres derive and index
the spatial column:

```sql
ALTER TABLE vendors
  ADD COLUMN geo geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
         THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    END
  ) STORED;
```

Why this shape:

- **Writes stay trivial.** Every existing insert/update that sets `lat`/`lng`
  keeps working untouched. No Drizzle `customType`, no EWKT/EWKB serialisation,
  no risk of a write path silently skipping the spatial column.
- **They can never drift.** A generated column cannot go stale the way a
  trigger-maintained one can.
- **Reads are explicit.** Distance queries use `sql` fragments in the
  repository, which is where raw SQL belongs under your module rules anyway.
- Drizzle can either declare it via `customType(...).generatedAlwaysAs(...)`
  for schema fidelity, or omit it entirely and reference `vendors.geo` through
  `sql`. Prefer declaring it so `drizzle-kit` doesn't try to drop it.

**⚠️ Widen `lat`/`lng` to `double precision` in the same migration.** They are
`real` (float4) today — about 7 significant digits total, so ~1m of achievable
precision at Indian latitudes and worse rounding behaviour under arithmetic.
Coordinates should be float8. Do it now while the tables are small; it is a
table rewrite you do not want at scale.

### Migration `0019_add_geo.sql` (sketch)

```sql
-- Decision: PostGIS goes in a dedicated `gis` schema (see note below).
-- Do this bit via the Supabase dashboard (Database > Extensions > postgis >
-- "Create a new schema" > gis), or by hand:
CREATE SCHEMA IF NOT EXISTS gis;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA gis;

-- Make ST_* resolvable without qualifying every call. Role-level, NOT a
-- session SET -- see the pooling note in §10.
ALTER ROLE <app_db_role> SET search_path = "$user", public, gis;

-- 1. float4 -> float8. Cheap now, expensive later.
ALTER TABLE vendors        ALTER COLUMN lat TYPE double precision,
                           ALTER COLUMN lng TYPE double precision;
ALTER TABLE user_addresses ALTER COLUMN lat TYPE double precision,
                           ALTER COLUMN lng TYPE double precision;
ALTER TABLE bookings       ALTER COLUMN lat TYPE double precision,
                           ALTER COLUMN lng TYPE double precision;
ALTER TABLE booking_intents ALTER COLUMN lat TYPE double precision,
                            ALTER COLUMN lng TYPE double precision;

-- 2. Generated spatial column + index. Vendors is the one that gets searched.
ALTER TABLE vendors ADD COLUMN geo geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
         THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography END
  ) STORED;

CREATE INDEX vendors_geo_idx ON vendors USING GIST (geo);

-- Partial index matching the listing predicate, so the KNN walk only ever
-- touches listable rows.
CREATE INDEX vendors_geo_listable_idx ON vendors USING GIST (geo)
  WHERE status = 'active' AND is_verified = true;

-- 3. Same for saved addresses (used by doorstep coverage checks).
ALTER TABLE user_addresses ADD COLUMN geo geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED;

-- 4. Doorstep coverage radius. Distinct from pickup_radius_km, which is
--    pickup-and-drop, not doorstep service.
ALTER TABLE vendors ADD COLUMN doorstep_radius_km double precision;

-- 5. Provenance: how did we get these coordinates, and do we trust them?
CREATE TYPE geo_source AS ENUM ('gps', 'map_pin', 'geocoded', 'admin', 'unset');
ALTER TABLE vendors ADD COLUMN geo_source geo_source NOT NULL DEFAULT 'unset';
ALTER TABLE vendors ADD COLUMN geo_confirmed_at timestamptz;
```

`geo_source` + `geo_confirmed_at` are worth the two columns: they let the admin
verification screen show "this pin was never confirmed by a human", and they
drive the vendor-facing "set your location" task in §7.

#### Why `gis` and not `public` — and why this one is close to irreversible

**PostGIS 2.3+ is not relocatable between schemas.** `ALTER EXTENSION postgis
SET SCHEMA …` is refused. Changing your mind later means dropping the
extension — and with it every dependent column, index and generated
expression — then recreating and rebuilding. So this is effectively a one-way
door, which is why it's worth thirty seconds of thought rather than defaulting.

Taking `gis`:

- It is what Supabase's own dashboard flow does, and what their security
  linter (`extension_in_public`) wants. Following the platform's default path
  means platform upgrades, backups and restores are the tested case.
- It keeps `public` as *your* tables. `\dt` stays readable; a `pg_dump` of
  your schema doesn't drag 1,000+ PostGIS functions along.
- The only cost is the `search_path` line above — set **once, at the role
  level**. That is not the thing that breaks under transaction pooling
  (per-session `SET` is), because the pooler applies role settings when it
  opens each server connection.

The counterargument for `public` is purely "one less moving part", and it
buys you a schema you can never clean up. Take `gis`.

**Two things that must also see the schema:** `server/scripts/migrate.sh`
(it connects as the migration role — either the same `ALTER ROLE`, or
`PGOPTIONS=-csearch_path=public,gis`), and `drizzle.config.ts` introspection.

**Per AGENTS.md, do not run this migration — write the file and hand it over.**

### The listing query

```sql
SELECT v.id, v.business_name, /* … */
       ST_Distance(v.geo, $point) AS distance_m
FROM vendors v
WHERE v.status = 'active'
  AND v.is_verified = true
  AND v.geo IS NOT NULL
  AND ST_DWithin(v.geo, $point, $radius_m)
ORDER BY v.geo <-> $point
LIMIT $limit OFFSET $offset;
```

Notes that matter:

- `<->` on `geography` returns **metres** and is index-assisted (PostGIS ≥ 2.2;
  Supabase runs 3.x). This is the piece that makes it scale — `ORDER BY
  ST_Distance(...)` alone would be a sort over the whole filtered set.
- `ST_DWithin` defaults to spheroid maths. Passing `false` as a 4th arg uses a
  sphere and is measurably faster; at city scale the error is under 0.5%.
  Worth doing for the *filter*, keep the spheroid for the displayed distance.
- Vendors with `geo IS NULL` never reach this query at all, because a garage
  cannot be verified without a pin (§7) and the listing already requires
  `is_verified`. So there is no "location not set" tail to design and no risk of
  a coordinate-less garage rendering at "0 km" — the same "unknown ≠ zero" rule
  your code applies to price and rating in `web/lib/sort-vendors.ts`, but
  enforced upstream instead of at sort time. Keep the `geo IS NOT NULL`
  predicate anyway: it is free, and it makes the invariant local to the query
  rather than something a reader has to know about the verification flow.

### Doorstep coverage, finally enforced

```sql
-- Is this garage willing to come to this customer?
ST_DWithin(v.geo, $customer_point, COALESCE(v.doorstep_radius_km, 0) * 1000)
```

Applied in two places: as a filter when `bookingType = 'doorstep'` in the
listing, and as a hard check in `createBooking` before an intent is priced.
`vendor_service_areas` stays as a human-readable "areas we cover" display list
and a coarse pincode fallback for garages with no radius set — it stops being
the (unenforced) source of truth.

---

## 3. Getting the customer's location

**Free. Use the browser.** `navigator.geolocation.getCurrentPosition()`.
Requires HTTPS (you have it) and fires a one-time permission prompt.

### The resolution ladder

Never block the app on location. Resolve in this order, render immediately
with whatever you have:

1. Explicit choice this session (they picked an area / a saved address).
2. Live GPS, if already granted.
3. Saved default address (`user_addresses.is_default`).
4. Last known location from `localStorage`.
5. City default (Chennai) — list renders unsorted-by-distance, with a
   "Turn on location for accurate distances" nudge in the card where
   `distance` currently shows `—`.

### Permission UX

Do **not** prompt on first paint. A cold `getCurrentPosition()` on load gets
denied a lot, and a denial is sticky — you don't get a second chance without
the user digging through browser settings. Prompt on intent: when they tap the
location chip in the header (`web/app/home/page.tsx:73-81`, currently static
text "Home"), or tap a "Nearest first" sort option, show a one-line
explanation first, *then* call the API. Use `navigator.permissions.query({name:
'geolocation'})` to know whether you're about to prompt or not.

### Precision and privacy

- Sorting doesn't need better than ~100m. **Round to 3 decimals (~110m) when
  sending coordinates to the listing endpoint**, and don't log them. Full
  precision is only needed for a doorstep address the customer explicitly saves.
- Cache the last fix for ~5 minutes; don't re-poll per keystroke or per filter
  change.
- `enableHighAccuracy: false` for listing (faster, cheaper on battery, uses
  wifi/cell rather than GPS lock), `true` only for the doorstep address pin.

### New state

A small `web/lib/stores/location-store.ts` (Zustand, persisted), holding
`{ lat, lng, label, source, updatedAt }`. Home and search read from it and pass
`lat`/`lng` to `getVendors()`.

---

## 4. Getting the garage's location — GPS pin vs. Places search

You asked which is better. Short answer: **neither alone. Search to get close,
then a draggable pin to get it right, then reverse-geocode the final pin.**

### The comparison

| | **A. GPS "use my current location"** | **B. Places autocomplete → geocode** | **C. Hybrid: search → drag pin → reverse** |
|---|---|---|---|
| Accuracy | 10–100m in dense urban India; worse indoors, worse between tall buildings | POI centroid if the garage exists in the dataset; otherwise street-level or pincode centroid | Exactly where the owner says the gate is |
| Works remotely | ❌ Owner must be standing at the garage | ✅ | ✅ |
| Produces a clean address | ❌ Needs a reverse-geocode anyway | ✅ Canonical address + pincode + city in one shot | ✅ (from the reverse call) |
| Small independent garages | ✅ Doesn't care if it's in a dataset | ⚠️ Often absent from OSM *and* commercial POI sets; residential-lane garages match the street at best | ✅ |
| API cost | 0 (+1 reverse) | 1 autocomplete session + 1 geocode | 1 session + 1 reverse |
| Failure mode | Silently 80m off, nobody notices | Pin lands on the main road, not the lane | Owner sees the pin on a map and can tell it's wrong |

### Recommendation: **C, the hybrid.**

The deciding argument is not accuracy in the abstract — it's that **C is the
only one where a wrong answer is visible.** A and B both fail silently, and a
silently-wrong garage coordinate is permanent: it corrupts every distance sort,
every "nearest garage" result, and every doorstep radius check, for as long as
that garage exists. Onboarding happens once. Fifteen extra seconds of UI is
nothing against that.

Concretely, vendor onboarding **step 2** (`web/app/vendor/onboarding/step-2/page.tsx`,
which today collects address + pincode + a Maps link) becomes:

1. An address search box (autocomplete, debounced 300ms, min 3 chars, proxied
   through your API — see §5).
2. Picking a result drops a pin and centres a map on it.
3. A **"📍 Use my current location"** button that just moves the pin — this is
   how A gets folded in, as an accelerator rather than a mode.
4. The pin is **draggable**, and the map is pannable under a fixed centre
   crosshair (the Swiggy/Zomato/Uber pattern Indian users already know).
5. On drop, reverse-geocode the pin to prefill address / pincode / city — and
   let the owner **edit that text freely**. The pin is the source of truth for
   coordinates; the text is for humans and is often better written by the owner
   ("opposite the Indian Oil pump, 2nd lane").
6. Save `lat`, `lng`, `geo_source = 'map_pin'`.
7. Cannot continue without a pin. This is the one hard gate worth adding.

**Then confirm it.** `vendors.is_verified` is already a manual admin flip. Add
the pin to that screen: show the garage on a map next to its address and its
existing `maps_url`, let the admin nudge it, and stamp `geo_confirmed_at` on
verify. That is a free quality gate you already have a human standing at.

**On `vendors.maps_url`:** keep it as a display/navigate-out link. Do **not**
try to derive coordinates from it — `maps.app.goo.gl` short links need a
redirect follow and the coordinate format in the expanded URL is undocumented
and changes. It *is* a useful cross-check for the admin ("does this link land
where the pin is?").

Apply the same picker, minus the search box, to the **customer address form**
(`web/app/profile/page.tsx:143-168`) — replacing the hardcoded
`lat: 13.0067, lng: 80.2574`. For customers, lead with GPS: they're usually at
the address they're saving.

---

## 5. Maps & geocoding providers — staying free

Split the spend by need. These have genuinely different providers and volumes:

| Need | Volume | Recommendation | Free tier |
|---|---|---|---|
| **Basemap tiles** | Highest — every map pan/zoom | **OpenFreeMap** | No key, no registration, no documented limit |
| **Autocomplete / place search** | Medium — per keystroke if undebounced | **Ola Maps** | 100k events/mo (all products, from 1 Sep 2026) |
| **Forward geocode** (address → coords) | Low | Ola Maps | ↑ same pool |
| **Reverse geocode** (coords → address) | Low–medium | Ola Maps | ↑ same pool |

### Why this split

**Tiles: OpenFreeMap.** Free, open-source, OSM-based vector tiles served
without an API key. Styles: `liberty`, `positron`, `bright`. Attribution is
added automatically by MapLibre. Since tiles are by far the highest-volume
call, getting them to genuinely zero is the single biggest cost lever.
*Trade-off:* it's a donation-funded public instance with no SLA. Mitigation:
put the style URL in an env var so switching to **MapTiler** (100k requests/mo
free, no card) or **Carto**'s basemaps is a config change, not a code change.

**Geocoding: Ola Maps.** This is the one place where India-specific data
quality genuinely matters. OSM-derived geocoders (Nominatim, Photon, Geoapify,
LocationIQ) are noticeably weaker on Indian localities, apartment complexes,
landmark-relative addresses and pincode boundaries — exactly the addresses your
customers and garages have. Ola Maps is built on Indian data and covers
geocoding, reverse, autocomplete, place details, routing and tiles under one
free allowance.

⚠️ **Verify before building:** Ola Maps moves to a prepaid credit model on
**1 Sep 2026** — five days from now — with the first 100k monthly events free
(down from the older, more generous per-API allowance). 100k/month is still
enormous for your usage pattern (see the maths below), but confirm the current
terms and per-event Tier-2 rates at signup rather than trusting this document.

**Fallback: Geoapify or LocationIQ** free tiers (~3–5k/day, no card) if Ola's
terms don't suit. Keep the provider behind a one-file adapter so this is a
swap, not a rewrite.

**Explicitly not recommended: Google Places.** Beyond the billing account and
per-session pricing, Google's terms restrict displaying Places results on a
non-Google map. Using Google autocomplete would drag you onto Google tiles too,
which is precisely the cost you're trying to avoid. ⚠️ Verify current terms
yourself before dismissing it, but the licensing coupling is the real problem,
not the price. Also avoid **Nominatim's public instance** — its usage policy
prohibits autocomplete-style traffic (1 req/s, no bulk). Fine for a one-off
backfill script with proper rate limiting; not for production typing.

### Why 100k/month is not a constraint for you

Because of the design above, geocoding is **not** proportional to traffic:

- **Garage coordinates: geocoded once, ever.** 500 garages onboarded = a few
  thousand calls total, spread over months.
- **Customer location: GPS is free.** Zero API calls to sort a list by distance.
- **Reverse geocoding fires only when someone saves an address** — not on
  every location read, not on every listing.
- **Autocomplete is the only per-keystroke risk**, and it's controlled:
  debounce 300ms, minimum 3 characters, use provider session tokens if
  available. A user typing a 25-character address generates ~5 calls, not 25.

Rough ceiling: 500 garages × ~10 calls each during onboarding + 5,000
customers × ~6 calls each for one saved address = ~35k calls **total**, not
per month. The steady state is far below that.

### Architecture: proxy every provider call

Add a `geo` module server-side, following your standard structure
(`geo.route.ts` / `.controller.ts` / `.service.ts` / `.validation.ts` — no
repository initially):

```
GET /api/v1/geo/autocomplete?q=…&lat=&lng=   → provider autocomplete
GET /api/v1/geo/reverse?lat=…&lng=…          → provider reverse geocode
GET /api/v1/geo/geocode?q=…                  → provider forward geocode
```

Non-negotiable reasons this is a proxy and not a direct browser call:

1. **The API key never ships to the browser.** A key in client JS is a key
   someone else spends your free tier on.
2. **You can cache.** Reverse-geocode results keyed on coordinates rounded to
   4 decimals (~11m) collapse enormously — every customer in one apartment
   block is one cache entry. A tiny `geo_cache (cache_key text primary key,
   payload jsonb, created_at)` table with a TTL is enough; no Redis needed.
   *(This is where geohash earns its place — as the cache key.)*
3. **You can rate-limit.** You already have `rate-limit.middleware.ts`.
4. **You can swap providers** without touching the frontend.

Tiles are the exception — those go straight from browser to tile host, since
OpenFreeMap needs no key.

### The provider adapter

**Decision: Ola Maps first, but nothing outside the adapter ever knows that.**
Provider choice is the least durable decision here — free tiers change (Ola's
is changing in five days), data quality varies by city, and MapmyIndia or
Google may win later on a specific capability. So it gets an interface.

`server/src/lib/geo/` — one file per provider, one shared contract:

```ts
// geo/types.ts — the whole surface. Provider-neutral, deliberately minimal.
export interface GeoPlace {
  /** Provider's opaque id. Only meaningful to the provider that issued it. */
  providerPlaceId: string | null
  /** One-line label for a dropdown row. */
  label: string
  /** Full formatted address, when the provider gives one. */
  formatted: string | null
  lat: number | null          // null for autocomplete rows that need a details call
  lng: number | null
  city: string | null
  pincode: string | null
  /** 0..1, normalised by the adapter. Null when the provider reports none. */
  confidence: number | null
}

export interface GeoProvider {
  readonly name: 'ola' | 'google' | 'mappls' | 'geoapify' | 'locationiq'
  /** Typing an address. `near` biases results to the user's map view. */
  autocomplete(q: string, near?: { lat: number; lng: number }, sessionToken?: string): Promise<GeoPlace[]>
  /** Address text -> coordinates. */
  geocode(q: string): Promise<GeoPlace[]>
  /** Coordinates -> address. Used after a pin drop. */
  reverse(lat: number, lng: number): Promise<GeoPlace | null>
  /**
   * Some providers (Google, Ola) return autocomplete rows without
   * coordinates and require a second call. Adapters that don't need this
   * return the place unchanged, so callers never branch on provider.
   */
  resolve(place: GeoPlace): Promise<GeoPlace>
}
```

Rules that make the swap actually cheap — these are the parts people skip:

- **`geo.service.ts` depends on `GeoProvider`, never on a concrete adapter.**
  Selection is one `switch` on `GEO_PROVIDER` in `lib/env.ts`, resolved once at
  startup. Adding Google later = one new file + one `case`.
- **Normalise inside the adapter, not at the call site.** Confidence scores,
  address component names and pincode fields differ wildly between providers.
  If any of that leaks past the adapter you have not built an adapter, you have
  built a rename.
- **Never persist a `providerPlaceId` as if it were stable across providers.**
  Store `lat`/`lng` (which are universal) plus, at most, the id *and* the
  provider name together. Coordinates are the durable artifact; place ids are
  not.
- **The HTTP proxy routes are provider-neutral by shape** — `/geo/autocomplete`
  returns `GeoPlace[]`, so the web app never changes when the provider does.
- **Cache keys include the provider name**, so a swap doesn't serve you stale
  rows shaped by the old one.
- **Tiles get the same treatment, more cheaply:** the MapLibre style URL is
  `NEXT_PUBLIC_MAP_STYLE_URL` in env. OpenFreeMap → MapTiler → Ola tiles is a
  config change with no code involved.

One honest caveat: an adapter gives you *portability*, not *parity*. Google's
autocomplete is session-token-priced and its terms restrict showing results on
a non-Google map (§5); MapmyIndia's free tier is smaller. The interface means
you can switch in an afternoon — it doesn't mean the switch is free.

---

## 6. Frontend: mapcn

You flagged [mapcn](https://www.mapcn.dev/) and it's a genuinely good fit —
better than pulling MapLibre in raw.

**Why it fits this codebase specifically:** it's MapLibre GL + Tailwind
components distributed the shadcn way (`npx shadcn@latest add
https://mapcn.dev/maps/map.json` copies the source into
`web/components/ui/map.tsx`, yours to edit). You already run shadcn +
Tailwind v4 + React 19, so it drops straight in. MIT licensed, free, no
account, no key. Because it's MapLibre underneath it works with any style URL —
so OpenFreeMap, MapTiler and Carto are all just a `style` prop.

Components: `Map`, controls, markers, popups, routes, arcs, GeoJSON, clusters.
Blocks include a **Store Locator** (searchable list synced with map markers) —
that is almost exactly the "browse garages on a map" view, and worth starting
from rather than building.

**What mapcn does not give you:** a geocoder / address search box, and a
drag-pin address picker. Those you build on top — a `<Map>` with a draggable
`<Marker>` and a search input wired to your `/geo/autocomplete` proxy. That's a
small component, not a project.

**Weigh it honestly:** it's a young single-maintainer project. The shadcn
distribution model is the mitigation — the code lands in *your* repo, so an
abandoned upstream costs you nothing. If you'd rather not, `maplibre-gl`
directly plus ~150 lines is the fallback; the architecture doesn't change.

**Bundle cost:** `maplibre-gl` is ~200KB gzipped. Load it dynamically
(`next/dynamic`, `ssr: false`) so it isn't in the home-page bundle — the map is
needed on the picker and the map view (Phase 5), not on the listing.

---

## 7. Existing data: no backfill, a status instead

**Decision: never guess a coordinate.** No geocoding backfill script. A garage
whose owner hasn't dropped a pin gets a visible status and a task, not a
best-effort guess parked in the spatial index. This is the right call — a
geocoded guess is indistinguishable from a real pin once it's in the table, and
"probably about right" coordinates are exactly what corrupts a distance sort
quietly.

### Garages

1. **Null out the placeholders.** `UPDATE vendors SET lat = NULL, lng = NULL
   WHERE lat = 13.0067 AND lng = 80.2574;` — an honest NULL beats a confident
   lie that puts every garage on one street corner. `geo_source` stays `'unset'`.

2. **Make the pin a verification requirement.** This is the neat part: listings
   already require `status = 'active' AND is_verified = true`
   (`vendors.repository.ts:69-86`). If an admin cannot flip `is_verified`
   without a confirmed pin, then **a garage with no coordinates can never reach
   a customer-facing list** — and the distance query needs no special case, no
   "location not set" tail, and no risk of a coordinate-less garage showing at
   0 km. The constraint enforces itself through a gate you already have.

   Server-side: reject `is_verified = true` when `geo IS NULL`. Admin UI: the
   verify button is disabled with "Set garage location first".

3. **Give the vendor the task.** Vendor dashboard (`web/app/vendor/home`) gets a
   persistent card — *"Your garage location isn't set. Customers can't find you
   until it is."* — deep-linking to the map picker. Since this is the thing
   standing between them and any bookings at all, it needs no other nudge.

4. **Make it impossible to recreate.** Onboarding step 2 cannot continue without
   a pin (§4), and `POST /vendors` requires `lat`/`lng`. New garages are never
   in this state; the status only ever describes the handful that predate the
   feature.

5. **Admin visibility.** Sort/filter the admin vendor list on `geo IS NULL` so
   the fix-it queue is self-evident, and surface `geo_source` +
   `geo_confirmed_at` on the vendor row.

**A note on `geo_source = 'geocoded'`:** the enum keeps that value even though
nothing writes it today. It's there for the adapter's forward-geocode path if
you ever do choose to bulk-import a partner's garage list — at which point the
value is what tells you those rows still need a human pass.

### Customer addresses

`user_addresses.lat`/`lng` are `NOT NULL` and every row holds the same fake
Chennai point. **You confirmed there are no real users yet**, so this needs no
migration subtlety:

1. Truncate the placeholder rows, or `UPDATE … SET lat = NULL, lng = NULL` after
   relaxing the `NOT NULL` — either is fine at zero real rows. Prefer relaxing
   the constraint anyway: an address with text but no pin is a legitimate state
   going forward, and modelling it now avoids a second migration later.
2. The address form (`web/app/profile/page.tsx:143-168`) gets the map picker and
   stops hardcoding coordinates. GPS-first for customers — they're usually
   standing at the address they're saving.
3. **Re-prompt at the point of use.** An address with no pin is still perfectly
   usable for a drop-in booking; it only matters for doorstep. So gate it there:
   selecting a pin-less address for a doorstep booking opens the picker inline
   ("Confirm exactly where we should come") rather than blocking. No banner, no
   profile-wide nag — the prompt appears where the coordinate is actually needed
   and the customer's motivation is highest.

---

## 8. API surface changes

### Two query shapes, decided now because of the map view

You want an Airbnb-style split list/map eventually. That view is not just a
rendering change — it queries differently. "Search as I move the map" is a
**bounding-box** query (what's inside the viewport rectangle), not a radius
query (what's within N km of a point). Bolting bbox onto a radius-only endpoint
later means reshaping the contract, the cache keys and the client. Designing
for both now costs one extra branch in the repository.

So `GET /vendors` accepts **either** origin shape, never both:

| Param | Type | Notes |
|---|---|---|
| `lat`, `lng` | float, both-or-neither | Radius mode. Customer origin |
| `radiusKm` | float, default 50 (`LIST_RADIUS_KM`), max 50 | Radius mode only; ignored with `q` |
| `bbox` | `minLng,minLat,maxLng,maxLat` | Map mode. Mutually exclusive with `radiusKm` |
| `sort` | `distance \| rating \| price_asc \| price_desc \| relevance` | `distance` default when an origin is known, else `rating` |
| `limit`, `cursor` | pagination | Unbounded today |

In map mode you still pass `lat`/`lng` (the map centre) so distances stay
meaningful and `sort=distance` still works — the bbox replaces the *filter*,
not the origin.

```sql
-- radius mode
AND ST_DWithin(v.geo, $point, $radius_m, false)
-- map mode: && is the index-accelerated bbox overlap operator
AND v.geo && ST_MakeEnvelope($minLng, $minLat, $maxLng, $maxLat, 4326)::geography
```

Both hit the same GiST index. `ORDER BY v.geo <-> $point LIMIT n` is unchanged.

### Radius: every garage within 50 km — and doorstep doesn't use it at all

> **Superseded 2026-10-16 (owner decision).** This section first said 10 km
> with a 10 → 25 → 50 km ladder. The ladder stopped at the first ring with
> anything in it, so one garage within 10 km hid every garage 11–50 km away,
> and page 2 restarted it at 10 km, skipping the rest of a widened list. The
> owner wants customers to see every garage within reach.

**Drop-in and browse: one radius, 50 km (`LIST_RADIUS_KM`,
`apps/server/src/lib/discovery.ts`), nearest first, the same on every page.**
The response says the bound it searched, `radiusKm: 50`, even when nothing
was found, so the list can say *"Garages within 50 km of you, nearest first"*
or *"No garages within 50 km of you yet."* `appliedRadiusKm` is deprecated
and always null: bundles from the ladder days print "Nothing within 10 km"
for any value over 10. Home's Nearby card counts within the same 50 km, and
the map opens framing the customer and every garage within it (its nearby
mode, `apps/users/app/map/page.tsx`; "Search this area" switches to `bbox`).

- **No location:** no radius and no distance; every garage, A to Z, pinned
  first.
- **A typed search (`q`):** no radius. Someone typing a garage's name wants
  that garage wherever it is; results are still nearest first.
- **Unpinned garages** follow the located ones on the list (there is no
  distance to rank them by). The map leaves them out, and so does the Doorstep
  tab: a doorstep booking checks coverage from the garage's pin, so an
  unpinned one could never be booked.

**Doorstep ignores the customer's radius entirely.** The right question isn't
"how far will the customer look?" but "how far will this garage travel?" — and
that's `vendors.doorstep_radius_km`, set by the vendor, or a drawn area. The
radius is optional (owner, 2026-10-16): a garage that leaves it empty covers
`DEFAULT_DOORSTEP_RADIUS_KM` = 10 km (`apps/server/src/lib/doorstep.ts`). The
same default is used by the Doorstep list and by the check when a doorstep
booking is written, so a garage listed for an address can be booked to it.
Before this, an empty radius covered 0 km and the garage vanished for every
customer with a location. So:

```sql
-- doorstep listing and booking check: the vendor's reach, not the customer's
AND v.doorstep_enabled
AND CASE WHEN v.doorstep_area IS NOT NULL THEN ST_Covers(v.doorstep_area, $customer_point)
         ELSE ST_DWithin(v.geo, $customer_point, COALESCE(v.doorstep_radius_km, 10) * 1000, false)
    END
```

This is strictly better than a symmetric radius: a premium detailer willing to
drive 25 km appears for a customer a plain wash place 3 km away wouldn't serve.
It also means the doorstep list needs no customer radius — an empty result is
a true "nobody covers you yet", which is a genuinely useful thing to say.

`radiusKm` therefore applies only when `bookingType = 'dropin'`.

### Everything else

Response item gains `distanceKm: number | null`. `web/lib/api/mappers.ts:104,130`
stops hardcoding `'—'` and formats this; `vendor-card.tsx` needs no change — its
`hasDistance` guard already handles both states.

**Move filtering and sorting into SQL.** Today `q`, `category` and
`bookingType` filter in JS over the full table (`vendors.service.ts:417-437`)
and sorting happens on the client (`web/lib/sort-vendors.ts`). Neither survives
pagination — you cannot sort page 2 of a list the client can only partly see.
Distance sort forces this refactor, which is the point: it's the piece that
actually makes the listing scalable. `sortVendors` disappears.

**Sort within the bounded set.** Radius (or bbox) always bounds the candidates,
then `sort` orders within it. "Cheapest" means "cheapest within 10 km" — which
is what a customer means anyway, and it keeps every sort index-friendly and
pageable.

**`POST /vendors` / `PATCH /vendors/me`** — `lat`/`lng` required for new
vendors, plus `geoSource`. **`PATCH /admin/vendors/:id/verify`** — rejects when
`geo IS NULL` (§7). **Admin vendor create/edit** — lat/lng + confirm-on-map.
**Booking creation** — doorstep gains the `ST_DWithin` check above before
pricing, closing the gap in §1.

**New:** `GET /api/v1/geo/{autocomplete,reverse,geocode}` (§5).

---

## 9. Suggested phasing

Each phase is independently shippable and depends only on data that exists by
the time it starts.

**Phase 0 — Foundation (invisible).**
Migration `0019`: `gis` schema + PostGIS, role `search_path`, float8 widening,
generated `geo` columns, GiST indexes (incl. the partial listable one),
`doorstep_radius_km`, `geo_source`, `geo_confirmed_at`. Null out placeholder
coordinates. Relax `user_addresses.lat/lng` to nullable. No behaviour change.

**Phase 1 — Garage coordinates (data quality first).**
`server/src/lib/geo/` adapter + Ola implementation + `geo` proxy module.
Map picker component (mapcn + drag pin + search box). Wire into vendor
onboarding step 2 and admin vendor create/edit. Pin-required-to-verify rule +
vendor dashboard task card + admin queue (§7). **No backfill.**
This goes first because a distance sort over guessed coordinates is worse than
no distance sort.

**Phase 2 — Customer location + distance.**
`location-store`, permission UX, GPS capture. `lat`/`lng`/`radiusKm` on
`/vendors`, `ST_DWithin` + KNN in the repository, `distanceKm` in the response,
"Nearest first" in the sort sheet, the widen ladder. Vendor card lights up for
free. Customer address picker + doorstep re-prompt (§7).

**Phase 3 — Server-side sort + pagination.**
Move `q` / `category` / `bookingType` into SQL, all sorting into SQL, cursor
pagination + infinite scroll. Retire `web/lib/sort-vendors.ts`. **This is the
scalability milestone**, and the prerequisite for the map view paging sanely.

**Phase 4 — Doorstep coverage enforcement.**
`doorstep_radius_km` in vendor settings, vendor-radius filter in the doorstep
listing, hard check at booking creation. Closes a live correctness gap (§1).

**Phase 5 — The map view (Airbnb-style).**
Promoted from "optional" — this is now a real target, just not a blocker.
Split list/map: markers as price pills, hover-syncs-card, `bbox` querying with
"search as I move the map", clustering at low zoom. mapcn's **Store Locator**
block is the starting point rather than a from-scratch build. Phase 3's
pagination and Phase 0's bbox-capable index are both prerequisites, which is
why it sits here and not earlier.

Scope note if you want it sooner: a **read-only** map (markers, tap-to-open,
no bbox re-query) is a fraction of the work and could land alongside Phase 2 —
it just doesn't earn the "search this area" behaviour that makes the Airbnb
version feel alive. Worth doing only if you want the visual credibility early.

**Phase 6 — Later, if the data justifies it.**
Vendor-drawn service-area polygons (`ST_Contains`). Travel-time instead of
straight-line (Ola routing / distance matrix — note this *does* scale with
traffic and needs aggressive caching). H3 supply-vs-demand heatmaps for ops.

---

## 10. Risks & gotchas

- **PostGIS is not relocatable between schemas** (2.3+). The `gis` choice in §2
  is effectively permanent — changing it means dropping the extension and every
  dependent column and index. Get it right in `0019`.
- **Three connections must see the `gis` schema**, not just the app: the app
  role, the migration role used by `scripts/migrate.sh`, and `drizzle-kit`
  introspection. A missing one fails at runtime with a bare
  `function st_dwithin(...) does not exist`, which reads like a version problem
  and isn't.
- **Pooled connections (pgBouncer, 6543).** Role-level `search_path` is safe —
  the pooler applies it when opening server connections. A per-session
  `SET search_path` from the app is **not**, under transaction pooling. Keep it
  at the role level, never in application code.
- **`drizzle-kit` and generated/PostGIS columns.** Drizzle-kit has historically
  been shaky here and may try to drop or recreate them. You apply raw SQL via
  `scripts/migrate.sh` and AGENTS.md forbids `push`/`migrate`, so this is mostly
  moot — but declare the column in the schema file so introspection doesn't
  surprise you.
- **Straight-line ≠ drive time.** 2 km across a river is not 2 km. Label the UI
  "2.1 km away", never "8 min". Travel time is Phase 6 and costs per request.
- **Denied location permission is sticky.** Handle the denied state explicitly
  with a manual area picker; never leave a dead "enable location" button.
- **Ola's pricing changes on 1 Sep 2026** — five days out. Confirm the terms at
  signup rather than trusting this document. The adapter (§5) is what makes
  being wrong about this cheap.
- **Rounding coordinates before sending** (§3) is a privacy *and* a caching win —
  but do it consistently, or the `geo_cache` hit rate collapses.
- **Say how far the list reaches.** A 45 km garage high on a "Top Rated" list
  reads as a near one unless the list says "within 50 km". (This was the
  widen ladder's pitfall; the ladder is gone, the rule stays.)
- **Map-mode bbox queries can return enormous sets** when zoomed out to state
  level. Cap `limit` server-side and cluster client-side rather than trusting
  the viewport to be sane. (Done: limit 50, and overlapping pins are grouped
  into a count bubble in `apps/users/lib/map-view.ts`.)

---

## 11. Decision log

Resolved 2026-08-27. Recorded here because several are one-way doors.

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | PostGIS in `public` or `gis`? | **`gis`** + role-level `search_path` | Supabase's own default path; keeps `public` yours; extension is non-relocatable so follow the tested route. §2 |
| 2 | Geocoding provider | **Ola Maps, behind a `GeoProvider` adapter** | Best India data; adapter makes Google/MapmyIndia/Geoapify a one-file swap. §5 |
| 3 | Garages with no coordinates | **No backfill. Pin required to verify** | Listings already gate on `is_verified`, so this needs no tail and no special case in the query. §7 |
| 4 | Existing customer addresses | **Re-prompt at doorstep selection** | No real users yet; prompt where the coordinate is actually needed. §7 |
| 5 | Default radius | ~~10 km drop-in, ladder 10→25→50, visibly.~~ **2026-10-16: every garage within 50 km, nearest first, one radius on every page; none for a typed search.** Doorstep uses the *vendor's* radius, 10 km when left empty | Owner: customers see every garage in reach. The ladder hid 11–50 km whenever anything was within 10 km. Symmetric radius is the wrong model for doorstep — the garage decides how far it travels. §8 |
| 6 | Map view | **Airbnb-style split list/map is the target (Phase 5)** | Ships later, but forces the `bbox` query shape into the API now. §8, §9 |

**Still genuinely open** — none of these block starting:

- Which Ola tier you land on after 1 Sep, and whether Geoapify is worth wiring
  as a second adapter immediately or only when needed.
- Whether the read-only map lands early alongside Phase 2 (§9 scope note).
- `doorstep_radius_km` default for existing doorstep-enabled vendors — a
  sensible 8 km, or make them set it before doorstep stays on?

---

## Sources

- [Supabase — PostGIS: Geo queries](https://supabase.com/docs/guides/database/extensions/postgis)
- [Drizzle ORM — PostGIS geometry point](https://orm.drizzle.team/docs/guides/postgis-geometry-point)
- [Ola Maps — Pricing](https://maps.olakrutrim.com/pricing)
- [OpenFreeMap](https://openfreemap.org/) · [Quick start](https://openfreemap.org/quick_start/)
- [mapcn](https://www.mapcn.dev/) · [GitHub](https://github.com/AnmolSaini16/mapcn) · [Blocks](https://www.mapcn.dev/blocks)
- [MapLibre GL JS docs](https://maplibre.org/maplibre-gl-js/docs/)
- [LocationIQ](https://locationiq.com/) · [Best free geocoding APIs 2026 (Scrap.io)](https://scrap.io/free-geocoding-api-comparison-2026)
