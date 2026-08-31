DO $$ BEGIN
  CREATE TYPE "cancelled_by" AS ENUM ('user', 'vendor');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "cancelled_by" "cancelled_by";
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "cancellation_reason" text;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
