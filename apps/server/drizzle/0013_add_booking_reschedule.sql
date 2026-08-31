-- Reschedule support. A reschedule creates a NEW booking row and retires the
-- old one with status 'rescheduled' (which frees the old slot). The chain is
-- linked via original_booking_id, and each successful move is logged in
-- booking_reschedules — the source of truth for the "max 2 reschedules" cap.

ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'rescheduled';--> statement-breakpoint

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "original_booking_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "rescheduled_from_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "reschedule_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "bookings_original_booking_id_idx" ON "bookings" ("original_booking_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "booking_reschedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "original_booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "from_booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "to_booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "booking_reschedules_original_idx" ON "booking_reschedules" ("original_booking_id");
