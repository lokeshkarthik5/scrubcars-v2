-- "Did the garage ask you to book directly?": customers report a garage that
-- tried to take them off Detlio, Detlio confirms or dismisses the report, a
-- confirmed one rewards the customer with Detlio credit and counts as a
-- strike against the garage (and against Detlio Certified). Rules in
-- lib/bypass-reports.ts.
--
-- NUMBERING: runs after 0051 (the guarantee), itself after 0050 (rewards),
-- with no gap. Nothing here depends on them, and neither touches
-- `gift_credit_entries`, so the kind lists below are 0049's plus
-- `report_reward` (Detlio Rewards' vouchers are promo codes, not credit).
--
-- Changes:
--
--   - `bypass_reports`: one row per report, one per reschedule chain
--     (`root_booking_id` unique). The customer, the booking and the garage
--     are ON DELETE SET NULL, with the booking's reference and the garage's
--     name kept, so deleting an account, the pilot reset and Delete forever
--     keep the report (and a garage's strikes). `status` new → confirmed or
--     dismissed, once (CHECKs tie each to its time, typed name and reason).
--     `reward_status` none / owed / granted: at most one owed-or-granted
--     reward per customer per garage (partial unique index), and a granted
--     one names its ledger row (`reward_entry_id`, unique, RESTRICT).
--   - `gift_credit_entries`: a new lot kind, `report_reward` (positive, with
--     an expiry), for the ₹100 a confirmed report earns. The two CHECKs that
--     list kinds are dropped and added again with it.
--
-- Additive for the code in production: a new table nothing reads yet, and two
-- CHECKs that only allow more. Re-adding a CHECK validates the existing rows
-- (all of which pass, being one of the old kinds) under a short lock on
-- gift_credit_entries, a small table.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

ALTER TABLE "gift_credit_entries" DROP CONSTRAINT IF EXISTS "gift_credit_entries_kind_check";--> statement-breakpoint
ALTER TABLE "gift_credit_entries" ADD CONSTRAINT "gift_credit_entries_kind_check"
  CHECK ("kind" IN ('redeem', 'debit', 'refund', 'expiry', 'adjustment', 'report_reward'));--> statement-breakpoint

ALTER TABLE "gift_credit_entries" DROP CONSTRAINT IF EXISTS "gift_credit_entries_sign_check";--> statement-breakpoint
ALTER TABLE "gift_credit_entries" ADD CONSTRAINT "gift_credit_entries_sign_check" CHECK (
  ("kind" IN ('redeem', 'refund', 'report_reward') AND "amount" > 0)
  OR ("kind" IN ('debit', 'expiry') AND "amount" < 0)
  OR "kind" = 'adjustment'
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bypass_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "booking_id" uuid,
  "root_booking_id" uuid,
  "booking_ref" varchar(8) NOT NULL,
  "vendor_id" uuid,
  "garage_name" varchar(255) NOT NULL,
  "kind" text NOT NULL,
  "note" varchar(500),
  "status" text DEFAULT 'new' NOT NULL,
  "confirmed_at" timestamp with time zone,
  "confirmed_by" varchar(100),
  "dismissed_at" timestamp with time zone,
  "dismissed_by" varchar(100),
  "dismissed_reason" varchar(300),
  "reward_status" text DEFAULT 'none' NOT NULL,
  "reward_entry_id" uuid,
  "reward_granted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bypass_reports_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "bypass_reports_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "bypass_reports_root_booking_id_bookings_id_fk"
    FOREIGN KEY ("root_booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "bypass_reports_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "bypass_reports_reward_entry_id_fk"
    FOREIGN KEY ("reward_entry_id") REFERENCES "public"."gift_credit_entries"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "bypass_reports_reward_entry_id_unique" UNIQUE ("reward_entry_id"),
  CONSTRAINT "bypass_reports_kind_check"
    CHECK ("kind" IN ('book_directly', 'lower_price', 'pay_directly', 'gave_number', 'other')),
  CONSTRAINT "bypass_reports_status_check" CHECK ("status" IN ('new', 'confirmed', 'dismissed')),
  CONSTRAINT "bypass_reports_note_check" CHECK ("note" IS NULL OR char_length(btrim("note")) > 0),
  -- Confirmed carries when and who; dismissed carries when, who and why.
  CONSTRAINT "bypass_reports_confirmed_check" CHECK (
    ("status" = 'confirmed') = ("confirmed_at" IS NOT NULL AND "confirmed_by" IS NOT NULL)
  ),
  CONSTRAINT "bypass_reports_dismissed_check" CHECK (
    ("status" = 'dismissed') = (
      "dismissed_at" IS NOT NULL AND "dismissed_by" IS NOT NULL AND "dismissed_reason" IS NOT NULL
    )
  ),
  -- Only a confirmed report earns a reward, and a granted one names its
  -- ledger row and when.
  CONSTRAINT "bypass_reports_reward_status_check" CHECK ("reward_status" IN ('none', 'owed', 'granted')),
  CONSTRAINT "bypass_reports_reward_confirmed_check" CHECK ("reward_status" = 'none' OR "status" = 'confirmed'),
  CONSTRAINT "bypass_reports_reward_granted_check" CHECK (
    ("reward_status" = 'granted') = ("reward_entry_id" IS NOT NULL AND "reward_granted_at" IS NOT NULL)
  )
);--> statement-breakpoint

-- One report per booking (reschedule chain).
CREATE UNIQUE INDEX IF NOT EXISTS "bypass_reports_root_booking_key"
  ON "bypass_reports" ("root_booking_id");--> statement-breakpoint
-- One reward per customer per garage, owed or granted.
CREATE UNIQUE INDEX IF NOT EXISTS "bypass_reports_reward_once_key"
  ON "bypass_reports" ("user_id", "vendor_id")
  WHERE "reward_status" IN ('owed', 'granted');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bypass_reports_status_created_at_idx"
  ON "bypass_reports" ("status", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bypass_reports_user_id_created_at_idx"
  ON "bypass_reports" ("user_id", "created_at");--> statement-breakpoint
-- A garage's strikes: its confirmed reports by when they were confirmed.
CREATE INDEX IF NOT EXISTS "bypass_reports_vendor_confirmed_idx"
  ON "bypass_reports" ("vendor_id", "confirmed_at")
  WHERE "status" = 'confirmed';--> statement-breakpoint
-- The cron's owed rewards.
CREATE INDEX IF NOT EXISTS "bypass_reports_reward_owed_idx"
  ON "bypass_reports" ("confirmed_at")
  WHERE "reward_status" = 'owed';
