-- Service photos and videos: what a garage page shows for each service.
--
-- Owner decisions (16 Oct 2026) that shape this:
--
--   1. Garages (from their own app) and admin add up to 3 photos and one
--      video of at most 60 seconds per service.
--   2. Videos go through Cloudflare Stream, which encodes them for adaptive
--      playback up to Full HD and tells us by webhook when one is ready. A
--      video row is written as 'processing' when its upload starts and only
--      reaches customers once it is 'ready'.
--   3. Admin may make a sample picture with AI. Anything AI-made is shown to
--      customers tagged "Sample image", so where a row came from is stored.
--   4. Every upload needs the privacy tick: no number plates or faces can be
--      read, or the owner agreed. When it was ticked is stored per row.
--
-- The limits (3 photos, 1 video) are kept in the service layer under a row
-- lock on the service, not in a constraint, so they can move without a
-- migration (R2_MAX_IMAGES_PER_SERVICE already does for photos).
--
-- Purely additive: new columns with defaults or nulls on an existing table.
-- Every existing row is a photo uploaded to R2 ('image', 'upload'), which is
-- what the defaults say, and today's API never reads the new columns, so it
-- is safe to apply before the code that uses them is deployed.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

-- What the row is. Text with a CHECK rather than an enum, like
-- payments.gateway_mode, so a later kind is one more value, not an ALTER TYPE.
ALTER TABLE "service_images"
  ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'image'
  CONSTRAINT "service_images_kind_check"
  CHECK ("kind" IN ('image', 'video'));--> statement-breakpoint

-- 'upload' is a photo or video someone took; 'ai' a picture made with AI,
-- which customers see tagged "Sample image".
ALTER TABLE "service_images"
  ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'upload'
  CONSTRAINT "service_images_source_check"
  CHECK ("source" IN ('upload', 'ai'));--> statement-breakpoint

-- When the privacy tick was given for this row. Null only on rows from before
-- this file, which were added before the tick existed.
ALTER TABLE "service_images"
  ADD COLUMN IF NOT EXISTS "consent_confirmed_at" timestamp with time zone;--> statement-breakpoint

-- Who added it: the admin's name, or 'garage' for the garage's own app. A
-- name, like booking_notes.author: the break-glass admin login has no users
-- row. Never shown to customers.
ALTER TABLE "service_images"
  ADD COLUMN IF NOT EXISTS "uploaded_by" varchar(100);--> statement-breakpoint

-- The video's Cloudflare Stream uid. The webhook finds the row by it.
ALTER TABLE "service_images"
  ADD COLUMN IF NOT EXISTS "video_uid" varchar(64);--> statement-breakpoint

-- 'processing' from the upload until Stream says ready or failed. Null on
-- photos.
ALTER TABLE "service_images"
  ADD COLUMN IF NOT EXISTS "video_status" text
  CONSTRAINT "service_images_video_status_check"
  CHECK ("video_status" IN ('processing', 'ready', 'error'));--> statement-breakpoint

-- Why a video failed, in plain words for the garage ("Longer than 60
-- seconds — …"). Never Stream's raw error text.
ALTER TABLE "service_images"
  ADD COLUMN IF NOT EXISTS "video_error" varchar(200);--> statement-breakpoint

-- The ready video's length in whole seconds, for the "▶ 0:45" badge.
ALTER TABLE "service_images"
  ADD COLUMN IF NOT EXISTS "duration_secs" integer;--> statement-breakpoint

-- The ready video's poster frame, served by Stream.
ALTER TABLE "service_images"
  ADD COLUMN IF NOT EXISTS "poster_url" varchar(2048);--> statement-breakpoint

-- Stream's webhook looks a video up by its uid. Few rows have one, so the
-- index is partial; unique, because one upload is one row.
CREATE UNIQUE INDEX IF NOT EXISTS "service_images_video_uid_idx"
  ON "service_images" ("video_uid")
  WHERE "video_uid" IS NOT NULL;
