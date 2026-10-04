-- Job records (when each step happened, and before/after photos) and the final
-- bill for inspection jobs.
--
-- Three owner decisions shape this:
--
--   1. Record when each job step happened. `accepted_at`, `started_at` and
--      `completed_at` are written by the same conditional update that moves
--      the booking's status. Bookings from before this migration keep them
--      null: an old job has no recorded time rather than a made-up one.
--   2. Garages can attach before/after photos to a job as evidence if the
--      customer later disputes the work. Photos are optional and never block
--      completing a job.
--   3. Inspection-priced services work like a restaurant bill: the customer
--      prepays the inspection fee at checkout, and after the work the garage
--      raises the final bill in its portal. If it is more than was paid, the
--      customer pays the rest in the app; if not, nothing more is due and
--      nothing is refunded. `booking_charges` holds those bills.
--
-- Each file runs through `psql -f` without a wrapping transaction. Every
-- statement is safe to re-run.

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "job_photo_stage" AS ENUM ('before', 'after');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- `storage_key` is the R2 object, always under
-- vendors/<vendorId>/job-photos/<bookingId>/: the API refuses to record a key
-- from anywhere else. `uploaded_by` names the person, like bookings.accepted_by.
CREATE TABLE IF NOT EXISTS "job_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "stage" "job_photo_stage" NOT NULL,
  "storage_key" text NOT NULL,
  "url" text NOT NULL,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "job_photos_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "job_photos_uploaded_by_users_id_fk"
    FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action
);--> statement-breakpoint

-- Every read is "this booking's photos, by stage, oldest first", and the
-- six-per-stage cap counts the same rows.
CREATE INDEX IF NOT EXISTS "job_photos_booking_stage_created_at_idx"
  ON "job_photos" ("booking_id", "stage", "created_at");--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "booking_charge_kind" AS ENUM ('final_bill');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "booking_charge_status" AS ENUM ('due', 'paid', 'cancelled', 'not_needed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- The figures are snapshots taken when the bill is raised: `paid_before` is
-- what the booking already covers toward the bill (its price before any promo
-- discount, once its payment landed, so a discount is never charged back), and
-- `amount_due` is max(0, total_amount - paid_before). A bill that comes to no
-- more than that is written as 'not_needed', with nothing to pay. `lines` is an
-- array of { description, amount } as the garage typed them.
CREATE TABLE IF NOT EXISTS "booking_charges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "kind" "booking_charge_kind" NOT NULL,
  "total_amount" numeric(10, 2) NOT NULL,
  "paid_before" numeric(10, 2) NOT NULL,
  "amount_due" numeric(10, 2) NOT NULL,
  "lines" jsonb NOT NULL,
  "note" text,
  "status" "booking_charge_status" NOT NULL,
  "gateway_order_id" varchar(255),
  "gateway_payment_id" varchar(255),
  "paid_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "booking_charges_gateway_order_id_unique" UNIQUE ("gateway_order_id"),
  CONSTRAINT "booking_charges_gateway_payment_id_unique" UNIQUE ("gateway_payment_id"),
  CONSTRAINT "booking_charges_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "booking_charges_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "booking_charges_booking_id_idx"
  ON "booking_charges" ("booking_id");--> statement-breakpoint

-- At most one live final bill per booking. Replacing an unpaid bill cancels
-- the old row and writes a new one in one transaction, so two garage members
-- raising a bill at the same moment cannot both succeed.
CREATE UNIQUE INDEX IF NOT EXISTS "booking_charges_one_live_final_bill"
  ON "booking_charges" ("booking_id")
  WHERE "kind" = 'final_bill' AND "status" <> 'cancelled';
