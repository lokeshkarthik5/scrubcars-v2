-- Vendor-drawn doorstep service areas.
--
-- `vendors.doorstep_radius_km` (0019) answers "how far will you travel" with a
-- circle. Real coverage is rarely circular: a garage on one side of a river,
-- a highway or a city boundary will happily drive 15 km along one axis and
-- refuse 3 km across the water. A polygon says that; a radius cannot.
--
-- The radius is NOT replaced. It stays as the simple default that most garages
-- will never need to move beyond, and the polygon is an override for the ones
-- that do — checked first when present, with the radius as the fallback. That
-- keeps onboarding a one-number decision instead of a drawing exercise.

ALTER TABLE "vendors"
  ADD COLUMN "doorstep_area" gis.geography(Polygon, 4326);--> statement-breakpoint

-- ST_Covers/ST_Intersects against this are index-assisted the same way the
-- point queries are.
CREATE INDEX "vendors_doorstep_area_idx"
  ON "vendors" USING GIST ("doorstep_area");--> statement-breakpoint

COMMENT ON COLUMN "vendors"."doorstep_area" IS
  'Optional vendor-drawn doorstep coverage polygon. When present it overrides doorstep_radius_km; when null the radius applies.';
