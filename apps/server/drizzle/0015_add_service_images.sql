-- Per-service images. A vendor can attach a few photos to each service (and to
-- a package, which is a services row too); the garage page shows them in the
-- service details popup. The per-service cap lives in the service layer, not in
-- a constraint, so it can be tuned without a migration.
--
-- Rows cascade with the service. The R2 objects themselves are deleted
-- best-effort in the service layer, mirroring vendor_photos.

CREATE TABLE IF NOT EXISTS "service_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "service_id" uuid NOT NULL REFERENCES "services"("id") ON DELETE CASCADE,
  "url" varchar(2048) NOT NULL,
  "storage_key" varchar(1024),
  "sort_order" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "service_images_service_id_idx" ON "service_images" ("service_id");
