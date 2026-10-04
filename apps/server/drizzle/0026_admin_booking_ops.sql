-- Admin booking operations: cancel on someone's behalf, no-shows, and the ops
-- team's internal notes.
--
-- Three owner decisions shape this:
--
--   1. Detlio ops can cancel a booking for the customer, for the garage, or on
--      its own account, always with a reason. `cancelled_by` gains 'admin'
--      and a new `cancelled_on_behalf_of` records whose call it was.
--   2. A no-show cancels an accepted booking, and who didn't turn up decides
--      the money: a customer no-show keeps the payment (the published
--      policy), a garage no-show is refunded in full. `no_show` names the
--      party, `no_show_marked_at` when ops recorded it.
--   3. Notes are internal. They live in their own table so no customer or
--      garage query can pick them up by selecting a booking row.
--
-- Each file runs through `psql -f` without a wrapping transaction, so the new
-- enum value below is committed before the CHECK further down refers to it.
-- Every statement is safe to re-run.

ALTER TYPE "cancelled_by" ADD VALUE IF NOT EXISTS 'admin';--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "cancelled_on_behalf_of" AS ENUM ('customer', 'garage', 'detlio');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "no_show_party" AS ENUM ('customer', 'garage');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "cancelled_on_behalf_of" "cancelled_on_behalf_of";--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "no_show" "no_show_party";--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "no_show_marked_at" timestamp with time zone;--> statement-breakpoint

-- Both columns describe an admin cancellation. Either one on a booking that
-- was not cancelled by admin would be a record of something nobody did, so
-- the database refuses it rather than trusting every writer to remember.
DO $$ BEGIN
  ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_cancelled_on_behalf_of_admin_check"
    CHECK ("cancelled_on_behalf_of" IS NULL OR "cancelled_by" = 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_no_show_admin_check"
    CHECK ("no_show" IS NULL OR "cancelled_by" = 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- `author` is a display name rather than a users FK: the break-glass admin
-- login has no users row, and a note must say who wrote it either way.
CREATE TABLE IF NOT EXISTS "booking_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "author" varchar(100) NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "booking_notes_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint

-- Every read is "this booking's notes, newest first", or a count per booking
-- for the admin list.
CREATE INDEX IF NOT EXISTS "booking_notes_booking_id_created_at_idx"
  ON "booking_notes" ("booking_id", "created_at");
