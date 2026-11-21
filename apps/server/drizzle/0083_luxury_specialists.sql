-- Luxury car specialists (owner-approved screens, 21 Nov 2026,
-- reference/mockups/luxury-specialists): garages the Detlio team has
-- approved for luxury cars show a quiet "Luxury specialist" badge, and a
-- customer whose main car is a luxury make sees "Specialists for your
-- <Make>" above Nearby garages. Rules in apps/server/src/lib/luxury.ts.
--
--   luxury_applications   one row per garage: what it sent and where the
--                         team's answer stands. Sending again (after "Asked
--                         for more", a decline's wait or a removal) updates
--                         the same row; admin_audit_log keeps every decision.
--     status              review (waiting for the team), more (the team asked
--                         for more), approved, declined, removed (the team
--                         took the badge away). Text + CHECK, like the rest.
--     brands              the brands it handles, the form's exact values
--                         (lib/luxury.ts LUXURY_BRANDS); at least one.
--     photos              [{ url, caption }]: at least 3 photos of past
--                         luxury jobs, uploaded like garage photos (public R2
--                         bucket, vendors/<id>/luxury/…). Only admin sees them.
--     covered_bay         a covered or indoor bay, yes or no.
--     products, staff     optional text: the products it uses, who does the work.
--     team_note           the team's note on Ask for more, Decline or Remove;
--                         the garage reads it word for word.
--     decided_by/_at      who answered last (the signed-in admin's name) and when.
--     sent_at             its place in the queue (oldest first): kept by an
--                         edit while under review and by answering "Asked for
--                         more"; a send after a decline or removal joins now.
--     times_sent          1 on the first send; the panel says "first time".
--     sent_by             the garage seat that sent it (SET NULL with the user).
--
--   vendors.luxury_approved_at / _by / luxury_brands
--                         the badge itself: set by Approve (the brands copied
--                         from the application; the team can edit them),
--                         cleared by Remove. Customers see it only while the
--                         garage also holds Silver or Gold (LUXURY_SPECIALIST
--                         in vendors.predicates.ts). Internal: never on a
--                         public payload but as `luxury: { brands }`.
--
-- No backfill: nobody has the badge yet. Purely additive (a new table and
-- nullable columns the old API never reads). Every statement is safe to
-- re-run.

ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "luxury_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "luxury_approved_by" varchar(100);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "luxury_brands" text[];--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "luxury_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL REFERENCES "vendors" ("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'review',
  "brands" text[] NOT NULL,
  "photos" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "covered_bay" boolean NOT NULL,
  "products" text,
  "staff" text,
  "team_note" text,
  "decided_by" varchar(100),
  "decided_at" timestamp with time zone,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  "times_sent" integer DEFAULT 1 NOT NULL,
  "sent_by" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "luxury_applications_status_check"
    CHECK ("status" IN ('review', 'more', 'approved', 'declined', 'removed')),
  CONSTRAINT "luxury_applications_brands_check" CHECK (cardinality("brands") >= 1),
  CONSTRAINT "luxury_applications_photos_check" CHECK (jsonb_typeof("photos") = 'array'),
  CONSTRAINT "luxury_applications_products_check" CHECK ("products" IS NULL OR length("products") <= 300),
  CONSTRAINT "luxury_applications_staff_check" CHECK ("staff" IS NULL OR length("staff") <= 200),
  CONSTRAINT "luxury_applications_note_check" CHECK ("team_note" IS NULL OR length("team_note") <= 300),
  CONSTRAINT "luxury_applications_times_check" CHECK ("times_sent" >= 1)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "luxury_applications_vendor_key" ON "luxury_applications" ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "luxury_applications_status_idx" ON "luxury_applications" ("status", "sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendors_luxury_approved_idx" ON "vendors" ("luxury_approved_at") WHERE "luxury_approved_at" IS NOT NULL;
