-- Complaints that arrive outside the app, and favourite garages.
--
-- Owner decisions (17 Oct 2026):
--
-- 1. Complaints still arrive by phone, WhatsApp, email and in person. The
--    team now logs them on the Complaints tab, so they get a C-number and
--    the same 24-hour / 7-day clock as one raised in the app. Three new
--    columns on `complaints`:
--
--      - `source`: where it came from: 'app' (raised by the customer in the
--        app, every row before this file), or 'phone', 'whatsapp', 'email',
--        'in_person', 'other' (logged by the team). Text with a CHECK, like
--        `category`, so a new one is a constraint swap.
--      - `received_at`: when Detlio received the complaint, which is when
--        the clock starts. For an app complaint it is the moment it was
--        made; a logged one may be dated back up to 7 days (a WhatsApp
--        message read on Monday morning that arrived on Saturday night).
--        A new column rather than writing that time into `created_at`:
--        `created_at` stays the moment the row was written, which the
--        customer's per-hour limit, the test-data reset's cutoff and the
--        audit trail all read, and back-dating it would quietly move a
--        complaint across a reset cutoff. Existing rows get their
--        `created_at`, which is when they were received.
--      - `logged_by`: the name the team member typed when logging it. Null
--        exactly when the source is 'app' (the customer raised it).
--
--    A logged complaint for a phone number that has an account is linked to
--    it (`user_id`), so the customer sees it, and the team's answer, in the
--    app. Otherwise only the name and phone typed are kept, as before.
--
-- 2. `user_favourite_vendors`: the garages a customer saved with the heart.
--    One row per customer per garage; both foreign keys cascade, so deleting
--    the account (DELETE /users/me) or the garage (Delete forever) takes the
--    rows with it. Personal data (which garages someone likes), never shown
--    to anyone but the customer, and not test data: the pilot reset leaves
--    it alone, as it leaves accounts and cars.
--
-- Purely additive relative to the code in production: today's API inserts
-- complaints without the new columns, which the defaults fill exactly as
-- before ('app', received now, logged by no one), and it never reads the new
-- table. So it is safe to apply before the code that uses it is deployed.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

ALTER TABLE "complaints"
  ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'app' NOT NULL;--> statement-breakpoint

ALTER TABLE "complaints"
  ADD COLUMN IF NOT EXISTS "received_at" timestamp with time zone;--> statement-breakpoint

-- Every complaint so far was raised in the app: received when it was made.
UPDATE "complaints" SET "received_at" = "created_at" WHERE "received_at" IS NULL;--> statement-breakpoint

ALTER TABLE "complaints" ALTER COLUMN "received_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "complaints" ALTER COLUMN "received_at" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "complaints"
  ADD COLUMN IF NOT EXISTS "logged_by" varchar(100);--> statement-breakpoint

ALTER TABLE "complaints" DROP CONSTRAINT IF EXISTS "complaints_source_check";--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_source_check" CHECK (
  "source" IN ('app', 'phone', 'whatsapp', 'email', 'in_person', 'other')
);--> statement-breakpoint

-- The customer raised it in the app, or someone in the team logged it and
-- said who they are; never both, never neither.
ALTER TABLE "complaints" DROP CONSTRAINT IF EXISTS "complaints_logged_by_check";--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_logged_by_check" CHECK (
  ("source" = 'app') = ("logged_by" IS NULL)
  AND ("logged_by" IS NULL OR char_length(btrim("logged_by")) > 0)
);--> statement-breakpoint

-- A complaint cannot have been received after it was written down. (How far
-- back it may be dated, 7 days, is the API's rule: lib/complaints.ts.)
ALTER TABLE "complaints" DROP CONSTRAINT IF EXISTS "complaints_received_at_check";--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_received_at_check" CHECK (
  "received_at" <= "created_at"
);--> statement-breakpoint

-- The admin list's Open and Overdue now order and cut by when a complaint
-- was received. (complaints_status_created_at_idx stays for the code in
-- production until this release is out; a later release drops it.)
CREATE INDEX IF NOT EXISTS "complaints_status_received_at_idx"
  ON "complaints" ("status", "received_at");--> statement-breakpoint

-- Updates and Home read a customer's complaints answered in the last 30
-- days; complaints_user_id_created_at_idx already finds them by customer.

CREATE TABLE IF NOT EXISTS "user_favourite_vendors" (
  "user_id" uuid NOT NULL,
  "vendor_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_favourite_vendors_pkey" PRIMARY KEY ("user_id", "vendor_id"),
  CONSTRAINT "user_favourite_vendors_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "user_favourite_vendors_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint

-- So deleting a garage (Delete forever) finds its rows without reading the
-- table; the primary key already serves the customer's own list.
CREATE INDEX IF NOT EXISTS "user_favourite_vendors_vendor_id_idx"
  ON "user_favourite_vendors" ("vendor_id");
