-- Complaints with a reference number and a response clock.
--
-- Owner decision (17 Oct 2026): every complaint gets a number the customer
-- can quote ("C-000123") and a visible clock. The Contact page already
-- promises to acknowledge a complaint within 24 hours and resolve it within
-- 7 days (Consumer Protection (E-Commerce) Rules 2020 rule 4(5), IT Rules
-- 3(2)); until now complaints came by phone, WhatsApp or email with neither.
--
--   - `complaints`: one row per complaint, raised by a signed-in customer
--     from a booking's Help sheet (the booking and its garage attached) or
--     from the Contact page (neither). The team acknowledges, resolves (with
--     a note the customer sees) or closes it from admin.
--   - `complaint_number_seq`: the number. A SEQUENCE, so two customers
--     complaining at the same moment never wait on each other; the price is
--     that a rolled-back insert leaves a gap, which a complaint number can
--     live with (a receipt number cannot; see 0030). The number is stored as
--     an integer and printed as C-000123 by the app.
--
-- Nothing here is lost when something it points at goes: the customer's
-- account (DELETE /users/me), the booking (the test-data reset) or the
-- garage (Delete forever from the Bin) each sets its column to null, and the
-- name, phone, booking reference and garage name taken when the complaint
-- was made stay on the row.
--
-- Purely additive: a new sequence and a new table that today's API never
-- reads, so it is safe to apply before the code that uses it is deployed.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

CREATE SEQUENCE IF NOT EXISTS "complaint_number_seq" AS integer START WITH 1;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "complaints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "number" integer DEFAULT nextval('complaint_number_seq') NOT NULL,
  "user_id" uuid,
  -- As they were when the complaint was made, so it can still be answered
  -- after the account is deleted or renamed.
  "customer_name" varchar(255) NOT NULL,
  "customer_phone" varchar(20) NOT NULL,
  "booking_id" uuid,
  -- The booking's 8-character reference and the garage's name, kept for the
  -- same reason: a deleted booking or garage still has a name here.
  "booking_ref" varchar(8),
  "vendor_id" uuid,
  "garage_name" varchar(255),
  "category" text NOT NULL,
  "message" varchar(1000) NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  -- What the team tells the customer when it resolves or closes it. Shown in
  -- the customer's My complaints.
  "resolution_note" varchar(1000),
  -- The team's own note. Never sent to the customer.
  "admin_note" varchar(2000),
  -- Names, like booking_notes.author: the break-glass admin login has no
  -- users row.
  "acknowledged_at" timestamp with time zone,
  "acknowledged_by" varchar(100),
  "resolved_at" timestamp with time zone,
  "resolved_by" varchar(100),
  "closed_at" timestamp with time zone,
  "closed_by" varchar(100),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "complaints_number_unique" UNIQUE ("number"),
  CONSTRAINT "complaints_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "complaints_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "complaints_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "complaints_number_check" CHECK ("number" > 0),
  -- Text with a CHECK rather than an enum, like discounts.home_audience: a
  -- new category is one constraint swap, not an ALTER TYPE.
  CONSTRAINT "complaints_category_check" CHECK (
    "category" IN ('payment_or_refund', 'service_quality', 'garage_no_show',
                   'damage', 'app_problem', 'other')
  ),
  CONSTRAINT "complaints_status_check" CHECK (
    "status" IN ('open', 'acknowledged', 'resolved', 'closed')
  ),
  CONSTRAINT "complaints_message_check" CHECK (char_length(btrim("message")) > 0),
  -- Every step leaves its time, and only its own status lacks one: an open
  -- complaint has had no response; anything else has (resolving or closing
  -- an open one is the response, and stamps it at that moment).
  CONSTRAINT "complaints_acknowledged_check" CHECK (
    ("status" = 'open') = ("acknowledged_at" IS NULL)
  ),
  -- Resolved means answered in words the customer can read.
  CONSTRAINT "complaints_resolved_check" CHECK (
    "status" <> 'resolved'
    OR ("resolved_at" IS NOT NULL
        AND "resolution_note" IS NOT NULL
        AND char_length(btrim("resolution_note")) > 0)
  ),
  -- A closed complaint may have been resolved first; nothing else has a
  -- resolved_at.
  CONSTRAINT "complaints_resolved_at_check" CHECK (
    "resolved_at" IS NULL OR "status" IN ('resolved', 'closed')
  ),
  CONSTRAINT "complaints_closed_check" CHECK (
    ("status" = 'closed') = ("closed_at" IS NOT NULL)
  )
);--> statement-breakpoint

-- Dropping the table drops its number with it.
ALTER SEQUENCE "complaint_number_seq" OWNED BY "complaints"."number";--> statement-breakpoint

-- The admin list: by status (Open, Resolved), newest or oldest first, and
-- Overdue, which is open or acknowledged ones made before a cutoff.
CREATE INDEX IF NOT EXISTS "complaints_status_created_at_idx"
  ON "complaints" ("status", "created_at");--> statement-breakpoint

-- All, newest first; and the test-data reset's "made before the cutoff".
CREATE INDEX IF NOT EXISTS "complaints_created_at_idx"
  ON "complaints" ("created_at");--> statement-breakpoint

-- The customer's My complaints, and the per-customer limits on new ones.
CREATE INDEX IF NOT EXISTS "complaints_user_id_created_at_idx"
  ON "complaints" ("user_id", "created_at");--> statement-breakpoint

-- So deleting a booking or a garage (the reset, Delete forever) finds the
-- complaints to null out without reading the table. Most complaints have
-- one or the other, but not all, so both are partial.
CREATE INDEX IF NOT EXISTS "complaints_booking_id_idx"
  ON "complaints" ("booking_id")
  WHERE "booking_id" IS NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "complaints_vendor_id_idx"
  ON "complaints" ("vendor_id")
  WHERE "vendor_id" IS NOT NULL;
