-- Photo standards for every job, from the garage and the customer.
--
-- Owner decision (18 Oct 2026): "Before/after picture upload during the job
-- from the customer and the vendor — helps us preserve standards." Job photos
-- become a dependable record of every job: the garage must add at least two
-- before photos to start a job and two after photos to finish it (unless
-- JOB_PHOTOS_REQUIRED=off, or Detlio waives it on one booking), and the
-- customer may add their own photos of the car's condition. Rules in
-- apps/server/src/lib/job-photo-standards.ts.
--
-- Three changes:
--
--   - `job_photos.uploaded_by_role`: whose photo it is, `garage` or
--     `customer` (text + CHECK). Every existing row is the garage's, which the
--     default says without a backfill. Both sides share one record per
--     booking; only the garage's count toward the standard.
--   - `job_photos.angle`: the guided angle the photo was taken from (`front`,
--     `back`, `left`, `right`, `interior`; text + CHECK), null for an extra
--     photo and for every row from before this migration.
--   - `bookings.photos_waived_at` / `photos_waived_by` / `photos_waived_reason`:
--     Detlio waived the photo standard on this booking (a genuine case: the
--     garage's phone died, the customer refused). The admin's typed name and
--     the reason, all three set together or none (CHECK).
--
-- Purely additive: two nullable columns, one NOT NULL column with a constant
-- default (no table rewrite on PostgreSQL 11+), three nullable columns, their
-- CHECKs (each true of every existing row) and one index. Safe to apply
-- before the code that reads it is deployed: today's API never reads them,
-- and its inserts get the default role.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

ALTER TABLE "job_photos" ADD COLUMN IF NOT EXISTS "uploaded_by_role" text DEFAULT 'garage' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_photos" ADD COLUMN IF NOT EXISTS "angle" text;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_uploaded_by_role_check"
    CHECK ("uploaded_by_role" IN ('garage', 'customer'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_angle_check"
    CHECK ("angle" IS NULL OR "angle" IN ('front', 'back', 'left', 'right', 'interior'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- The gates and the per-side caps count one booking's photos of one stage
-- by one side; photo compliance counts the garage's per completed job.
CREATE INDEX IF NOT EXISTS "job_photos_booking_role_stage_idx"
  ON "job_photos" ("booking_id", "uploaded_by_role", "stage");--> statement-breakpoint

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "photos_waived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "photos_waived_by" varchar(100);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "photos_waived_reason" varchar(500);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_photos_waived_check"
    CHECK (
      ("photos_waived_at" IS NULL AND "photos_waived_by" IS NULL AND "photos_waived_reason" IS NULL)
      OR ("photos_waived_at" IS NOT NULL AND "photos_waived_by" IS NOT NULL AND "photos_waived_reason" IS NOT NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
