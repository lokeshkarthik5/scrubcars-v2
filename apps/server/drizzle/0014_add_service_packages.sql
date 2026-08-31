-- Service packages. A package is a `services` row with category = 'package',
-- so it books, prices, occupies slots and gets reviewed exactly like any other
-- service — bookings.service_id keeps pointing at a single row. What makes it
-- a package is the composition below: service_package_items links it to the
-- member services it bundles, which is what lets the UI itemize the contents
-- and compute a live "you save ₹X" against the members' current prices.
--
-- Note: Postgres forbids *using* a new enum value in the same transaction that
-- adds it. Nothing here inserts a row with category = 'package', so this is
-- safe in one migration — but any future backfill must live in its own file.

ALTER TYPE "service_category" ADD VALUE IF NOT EXISTS 'package';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "service_package_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "package_id" uuid NOT NULL REFERENCES "services"("id") ON DELETE CASCADE,
  "service_id" uuid NOT NULL REFERENCES "services"("id") ON DELETE RESTRICT,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "service_package_items_package_id_idx" ON "service_package_items" ("package_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_package_items_service_id_idx" ON "service_package_items" ("service_id");--> statement-breakpoint

-- A service can appear at most once in a given package.
CREATE UNIQUE INDEX IF NOT EXISTS "service_package_items_package_service_key" ON "service_package_items" ("package_id", "service_id");--> statement-breakpoint

-- A package cannot contain itself. Deeper nesting (a package containing another
-- package) is rejected in the service layer, which can see both rows' category.
ALTER TABLE "service_package_items" ADD CONSTRAINT "service_package_items_no_self_reference" CHECK ("package_id" <> "service_id");
