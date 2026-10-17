-- A garage suggests other times instead of declining, and asks for extra
-- work that the customer approves by paying in the app.
--
-- Owner decisions (17 Oct 2026):
--
--   - On a pending, paid booking the garage can offer one to three of its own
--     free times for the same job ("Suggest another time"), instead of
--     declining. The customer picks one, which moves the booking there
--     through the reschedule path, already accepted; or says none work,
--     which cancels it as the garage's decline with a full refund. Left
--     unanswered it expires (the earliest option less its booking type's
--     notice, or 12 hours, whichever is sooner) and is cancelled the same
--     way. One open suggestion per booking.
--       `booking_time_proposals`: the suggestion, its options, its outcome.
--       `booking_reschedules.proposal_id`: a move that was the customer
--       picking a suggested time. It does not count toward the customer's
--       two reschedules.
--
--   - On a confirmed or in-progress booking the garage can ask for extra
--     work (what, price, up to three photos). Paying it in the app is the
--     customer's approval. It is a booking charge like the final bill:
--       `booking_charge_kind` gains 'extra_work'.
--       `booking_charges.photos`: the photos, in the booking's job-photos
--       folder (extra work only).
--       `booking_charges.cancelled_at` / `cancel_reason`: when a charge
--       stopped standing, and why ('replaced', 'withdrawn', 'declined',
--       'booking_closed'). Null on rows cancelled before today.
--
-- The runner applies this file in one transaction, so the new 'extra_work'
-- value is not committed when the photos CHECK below is added, and Postgres
-- refuses to read it as a "booking_charge_kind" literal. The CHECK compares
-- "kind"::text instead, as 0026 and 0037 did. Nothing else in this file
-- uses the new value.
--
-- Purely additive: one enum value, a new table and nullable (or defaulted)
-- columns that today's API never reads or writes. A charge written by the
-- API in production before this release gets photos '[]' from the default
-- and nulls for the rest, which every CHECK accepts.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

ALTER TYPE "booking_charge_kind" ADD VALUE IF NOT EXISTS 'extra_work';--> statement-breakpoint

ALTER TABLE "booking_charges"
  ADD COLUMN IF NOT EXISTS "photos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint

ALTER TABLE "booking_charges"
  ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "booking_charges"
  ADD COLUMN IF NOT EXISTS "cancel_reason" text;--> statement-breakpoint

ALTER TABLE "booking_charges" DROP CONSTRAINT IF EXISTS "booking_charges_cancel_reason_check";--> statement-breakpoint
ALTER TABLE "booking_charges" ADD CONSTRAINT "booking_charges_cancel_reason_check" CHECK (
  "cancel_reason" IS NULL
  OR ("status" = 'cancelled' AND "cancel_reason" IN ('replaced', 'withdrawn', 'declined', 'booking_closed'))
);--> statement-breakpoint

-- At most three photos, and only on extra work.
ALTER TABLE "booking_charges" DROP CONSTRAINT IF EXISTS "booking_charges_photos_check";--> statement-breakpoint
ALTER TABLE "booking_charges" ADD CONSTRAINT "booking_charges_photos_check" CHECK (
  jsonb_typeof("photos") = 'array'
  AND jsonb_array_length("photos") <= 3
  AND ("kind"::text = 'extra_work' OR jsonb_array_length("photos") = 0)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "booking_time_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  -- ISO start times, soonest first: one to three.
  "slots" jsonb NOT NULL,
  "note" varchar(200),
  -- Text with a CHECK rather than an enum, like complaints.status.
  "status" text DEFAULT 'open' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_by" uuid,
  "chosen_slot" timestamp with time zone,
  "result_booking_id" uuid,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "booking_time_proposals_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "booking_time_proposals_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "booking_time_proposals_result_booking_id_bookings_id_fk"
    FOREIGN KEY ("result_booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "booking_time_proposals_status_check" CHECK (
    "status" IN ('open', 'accepted', 'declined', 'expired', 'withdrawn', 'closed')
  ),
  CONSTRAINT "booking_time_proposals_slots_check" CHECK (
    jsonb_typeof("slots") = 'array' AND jsonb_array_length("slots") BETWEEN 1 AND 3
  ),
  -- Open exactly while it has no outcome; a pick names its time.
  CONSTRAINT "booking_time_proposals_resolved_check" CHECK (
    ("status" = 'open') = ("resolved_at" IS NULL)
  ),
  CONSTRAINT "booking_time_proposals_chosen_check" CHECK (
    ("status" = 'accepted') = ("chosen_slot" IS NOT NULL)
  )
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "booking_time_proposals_booking_id_idx"
  ON "booking_time_proposals" ("booking_id");--> statement-breakpoint

-- One open suggestion per booking: two garage members pressing Send at once
-- cannot both succeed.
CREATE UNIQUE INDEX IF NOT EXISTS "booking_time_proposals_one_open"
  ON "booking_time_proposals" ("booking_id")
  WHERE "status" = 'open';--> statement-breakpoint

-- The pending-digest cron finds open ones that have run out.
CREATE INDEX IF NOT EXISTS "booking_time_proposals_open_expires_idx"
  ON "booking_time_proposals" ("expires_at")
  WHERE "status" = 'open';--> statement-breakpoint

ALTER TABLE "booking_reschedules"
  ADD COLUMN IF NOT EXISTS "proposal_id" uuid;--> statement-breakpoint

ALTER TABLE "booking_reschedules" DROP CONSTRAINT IF EXISTS "booking_reschedules_proposal_id_booking_time_proposals_id_fk";--> statement-breakpoint
ALTER TABLE "booking_reschedules" ADD CONSTRAINT "booking_reschedules_proposal_id_booking_time_proposals_id_fk"
  FOREIGN KEY ("proposal_id") REFERENCES "public"."booking_time_proposals"("id")
  ON DELETE set null ON UPDATE no action;
