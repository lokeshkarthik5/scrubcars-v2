-- Pre-iOS, part B: accounts and app fixes (owner, 29 Oct 2026; PRE-IOS-PR-BRIEF
-- "Part B").
--
-- Changes:
--
--   - `users.deleted_at`: the customer deleted their account in the app
--     (Apple 5.1.1(v)). The row stays, so bookings, receipts, refunds, gifts
--     and every money record keep their customer; the person is blanked
--     (lib/account-deletion.ts): the name reads "Deleted account", the phone
--     is freed for a new sign-up (a `deleted-` placeholder, never digits),
--     email, photo and birthday are cleared, and their cars, addresses,
--     sessions and the rest are deleted. CHECK: a deleted row holds the
--     placeholder phone.
--   - `bookings.garage_cancelled_at`: the garage cancelled a booking it had
--     accepted, before the job started (lib/garage-cancel.ts). Within 24
--     hours of the slot it counts as a missed booking in the tier metrics;
--     earlier it counts like a decline. CHECK: only on a garage-side
--     cancellation of an accepted booking.
--   - `garage_closure_requests`: a garage owner's "Close my garage" request
--     with a reason. At most one open per garage. The owner can cancel it
--     before the team acts; the team confirms it by moving the garage to the
--     Bin (which closes it as confirmed in the same transaction).
--   - `complaints.withdrawn_at`: the customer withdrew a complaint nobody had
--     answered yet. It is closed (status 'closed', stamped like a close) and
--     leaves every count. CHECK: only on a closed complaint.
--   - `guarantee_claims`: a new status 'withdrawn' (close reason
--     'withdrawn'): the customer withdrew a claim nobody had answered.
--     Closed, never approved.
--   - `booking_requests.withdrawn_at`: the garage withdrew its yes before the
--     customer paid. The request ends as 'cancelled' with its reply still
--     'accepted'. CHECK: only on such a row.
--
-- Additive: the code in production never reads the new columns or table,
-- and every widened CHECK still allows every row it allowed before.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_deleted_phone_check"
  CHECK ("deleted_at" IS NULL OR "phone" LIKE 'deleted-%');--> statement-breakpoint

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "garage_cancelled_at" timestamp with time zone;--> statement-breakpoint
-- ::text as in 0042: the enum comparisons stay valid whatever the enum holds.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_garage_cancelled_check"
  CHECK (
    "garage_cancelled_at" IS NULL
    OR ("status"::text = 'cancelled' AND "cancelled_by"::text = 'vendor' AND "accepted_at" IS NOT NULL)
  );--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_garage_cancelled_at_idx"
  ON "bookings" ("vendor_id", "garage_cancelled_at") WHERE "garage_cancelled_at" IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_closure_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "requested_by" uuid,
  "requested_by_name" varchar(255) NOT NULL,
  "reason" varchar(500) NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "cancelled_at" timestamp with time zone,
  "confirmed_at" timestamp with time zone,
  "confirmed_by_name" varchar(100),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_closure_requests_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_closure_requests_requested_by_users_id_fk"
    FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_closure_requests_status_check" CHECK ("status" IN ('open', 'cancelled', 'confirmed')),
  CONSTRAINT "garage_closure_requests_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 3 AND 500),
  CONSTRAINT "garage_closure_requests_cancelled_check" CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL)),
  CONSTRAINT "garage_closure_requests_confirmed_check" CHECK (
    ("status" = 'confirmed') = ("confirmed_at" IS NOT NULL AND "confirmed_by_name" IS NOT NULL)
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "garage_closure_requests_open_key"
  ON "garage_closure_requests" ("vendor_id") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "garage_closure_requests_status_created_idx"
  ON "garage_closure_requests" ("status", "created_at");--> statement-breakpoint

ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_withdrawn_check"
  CHECK ("withdrawn_at" IS NULL OR ("status" = 'closed' AND "closed_at" IS NOT NULL));--> statement-breakpoint

ALTER TABLE "guarantee_claims" DROP CONSTRAINT IF EXISTS "guarantee_claims_status_check";--> statement-breakpoint
ALTER TABLE "guarantee_claims" ADD CONSTRAINT "guarantee_claims_status_check" CHECK ("status" IN (
  'waiting_garage', 'needs_detlio', 'redo_approved', 'redo_booked',
  'redo_done', 'refund_approved', 'rejected', 'lapsed', 'withdrawn'
));--> statement-breakpoint
ALTER TABLE "guarantee_claims" DROP CONSTRAINT IF EXISTS "guarantee_claims_approved_check";--> statement-breakpoint
ALTER TABLE "guarantee_claims" ADD CONSTRAINT "guarantee_claims_approved_check" CHECK (
  "approved_at" IS NOT NULL OR "status" IN ('waiting_garage', 'needs_detlio', 'rejected', 'withdrawn')
);--> statement-breakpoint
-- A withdrawn claim was never approved.
ALTER TABLE "guarantee_claims" ADD CONSTRAINT "guarantee_claims_withdrawn_check" CHECK (
  "status" <> 'withdrawn' OR "approved_at" IS NULL
);--> statement-breakpoint
ALTER TABLE "guarantee_claims" DROP CONSTRAINT IF EXISTS "guarantee_claims_closed_check";--> statement-breakpoint
ALTER TABLE "guarantee_claims" ADD CONSTRAINT "guarantee_claims_closed_check" CHECK (
  ("status" IN ('redo_done', 'refund_approved', 'rejected', 'lapsed', 'withdrawn')) = ("closed_at" IS NOT NULL)
);--> statement-breakpoint
ALTER TABLE "guarantee_claims" DROP CONSTRAINT IF EXISTS "guarantee_claims_close_reason_check";--> statement-breakpoint
ALTER TABLE "guarantee_claims" ADD CONSTRAINT "guarantee_claims_close_reason_check" CHECK (
  ("closed_at" IS NULL) = ("close_reason" IS NULL)
  AND ("close_reason" IS NULL OR "close_reason" IN ('redo_done', 'redo_no_show', 'redo_not_booked', 'refund', 'rejected', 'withdrawn'))
  AND (("status" = 'withdrawn') = (coalesce("close_reason", '') = 'withdrawn'))
);--> statement-breakpoint

ALTER TABLE "booking_requests" ADD COLUMN IF NOT EXISTS "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_withdrawn_check"
  CHECK ("withdrawn_at" IS NULL OR ("status" = 'cancelled' AND "reply" = 'accepted'));
