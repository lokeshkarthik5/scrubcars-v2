-- Pickup & drop, part 1 of 2: the garage side.
--
-- Owner decisions (17 Oct 2026): the garage collects the car from the
-- customer's address, does the work at the garage and brings it back. Only
-- garages that turn it on, within their own pickup radius, with 3 hours'
-- notice (as doorstep). The garage is responsible for the car from pickup
-- until it is returned, and must accept that when it turns pickup on. No
-- pickup fee for now.
--
--   - `booking_type` gains 'pickup'.
--   - `vendors.pickup_terms_accepted_at` / `_by`: when, and by whom, the
--     responsibility terms were accepted (the garage's own tick in its
--     portal, or an admin recording the signed agreement). The existing
--     `vendors.pickup` ('yes' / 'nearby' / 'no') and `pickup_radius_km`
--     stay; "on" is pickup 'yes' or 'nearby' WITH terms on file, so a
--     garage that answered 'yes' at onboarding before today is not on until
--     it (or admin for it) accepts the terms.
--   - On `bookings`: the four handover steps (`picked_up_at`, `at_garage_at`,
--     `out_for_delivery_at`, `delivered_at`), the customer's two 4-digit
--     handover codes with their wrong-try counters, and the name of the
--     admin who confirmed a code step for a customer who could not give the
--     code.
--
-- The runner applies this file in one transaction, so the new 'pickup'
-- value is not committed when the CHECKs below are added, and Postgres
-- refuses to read it as a "booking_type" literal. The CHECKs compare
-- "booking_type"::text instead, as 0026 did for 'admin'. Nothing else in
-- this file uses the new value.
--
-- Purely additive: one enum value, nullable columns and two counters that
-- default to 0. Today's API writes none of them and every existing row
-- passes both CHECKs (no row is 'pickup', and every new column is null on
-- it), so this is safe to apply before the code that uses it is deployed.
-- Every statement is safe to re-run.

ALTER TYPE "booking_type" ADD VALUE IF NOT EXISTS 'pickup';--> statement-breakpoint

ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "pickup_terms_accepted_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "pickup_terms_accepted_by" varchar(120);--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "picked_up_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "at_garage_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "out_for_delivery_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "pickup_code" varchar(4);--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "delivery_code" varchar(4);--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "pickup_code_attempts" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "delivery_code_attempts" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "pickup_override_by" varchar(100);--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "delivery_override_by" varchar(100);--> statement-breakpoint

-- Handover steps and codes belong to pickup & drop only.
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_pickup_fields_check";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pickup_fields_check" CHECK (
  "booking_type"::text = 'pickup'
  OR (
    "pickup_code" IS NULL
    AND "delivery_code" IS NULL
    AND "picked_up_at" IS NULL
    AND "at_garage_at" IS NULL
    AND "out_for_delivery_at" IS NULL
    AND "delivered_at" IS NULL
  )
);--> statement-breakpoint

-- Four digits, as the garage types them.
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_handover_codes_check";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_handover_codes_check" CHECK (
  ("pickup_code" IS NULL OR "pickup_code" ~ '^[0-9]{4}$')
  AND ("delivery_code" IS NULL OR "delivery_code" ~ '^[0-9]{4}$')
);
