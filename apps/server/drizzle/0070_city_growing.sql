-- "Growing here": a per-city switch for the customer apps (owner request,
-- 10 Nov 2026).
--
-- One garage in a city does not mean Detlio has started there (a partner
-- garage, say), so the customer apps never promise more garages unless the
-- owner says so. With this on, the city's customers see the free-wash card
-- and that more garages are joining; off, they see just the garages there.
-- The owner flips it on Admin → Cities (super-admin, signed and audited, as
-- the city's other switch is).
--
-- Chennai (or Madras, its old name, should a database have it so) is set on,
-- so Chennai behaves exactly as it did before this file. Every other city
-- starts off.
--
-- Additive only: a new column with a default, which the API in production
-- never reads. Safe to run twice.

ALTER TABLE "cities" ADD COLUMN IF NOT EXISTS "growing" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Only rows still off, so a second run changes nothing. (0069's statement
-- trigger on cities still runs its recompute; it finds every garage's city
-- already right and writes no row.)
UPDATE "cities" SET "growing" = true, "updated_at" = now()
 WHERE lower(btrim("name")) IN ('chennai', 'madras') AND "growing" = false;
