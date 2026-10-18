-- Detlio Guarantee: a free redo within 48 hours when a job was not done
-- properly, decided on photos, with limits against misuse.
--
-- Behind GUARANTEE_ENABLED (default off). Rules in lib/guarantee.ts.
--
-- NUMBERING: 0051 runs after 0050 (Detlio Rewards), which is being built on a
-- parallel branch and will be merged before this one. Until it is, the
-- journal jumps from 0049 to 0051 and `migrate.sh lint` reports the gap; that
-- is expected and goes away when 0050 lands. Nothing here depends on 0050,
-- and 0050 does not touch these tables or columns.
--
-- Changes:
--
--   - `bookings.guarantee_redo`: a free redo of an earlier job (a ₹0 booking
--     written through the ordinary slot rule, so it holds the garage's room).
--     It earns the garage nothing and Detlio no commission, takes no receipt
--     number and is left out of Statistics.
--   - `bookings.guarantee_refund_at`: Detlio approved a refund instead of a
--     redo on this completed booking. lib/refunds.ts then owes its payment
--     back; the garage earns nothing on it. Completed bookings only, never a
--     redo (CHECK).
--   - `guarantee_claims`: one claim per booking (unique), with what is wrong,
--     where it went (the garage, Detlio, or approved at once for a job with
--     no garage photos) and why, the garage's answer and deadline, Detlio's
--     decision (the typed name, the reason the customer reads, an internal
--     note), when it was approved, the redo's window and booking, and how it
--     closed. Cascades with the booking, the customer and the garage; the
--     redo booking is SET NULL.
--   - `guarantee_claim_photos`: the customer's photos of the problem (keys in
--     the job's own folder). Cascade with the claim.
--
-- Purely additive: two new tables and two new columns (one NOT NULL with a
-- constant default, which does not rewrite the table on PostgreSQL 11+, one
-- nullable), which today's API never reads, so it is safe to apply before
-- the code that uses it is deployed.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "guarantee_redo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "guarantee_refund_at" timestamp with time zone;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guarantee_refund_check"
    CHECK ("guarantee_refund_at" IS NULL OR ("status"::text = 'completed' AND NOT "guarantee_redo"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "guarantee_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "vendor_id" uuid NOT NULL,
  "issues" text[] NOT NULL,
  "other_text" varchar(300),
  "status" text NOT NULL,
  "route" text NOT NULL,
  "route_reasons" text[] NOT NULL,
  "garage_respond_by" timestamp with time zone,
  "garage_response" text,
  "garage_note" varchar(500),
  "garage_responded_at" timestamp with time zone,
  "garage_responded_by" uuid,
  "detlio_decide_by" timestamp with time zone,
  "decision" text,
  "decided_by" varchar(100),
  "decided_at" timestamp with time zone,
  "decision_reason" varchar(500),
  "admin_note" varchar(1000),
  "approved_at" timestamp with time zone,
  "redo_book_by" timestamp with time zone,
  "redo_booking_id" uuid,
  "closed_at" timestamp with time zone,
  "close_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "guarantee_claims_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE,
  CONSTRAINT "guarantee_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "guarantee_claims_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
  CONSTRAINT "guarantee_claims_garage_responded_by_fkey" FOREIGN KEY ("garage_responded_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "guarantee_claims_redo_booking_id_fkey" FOREIGN KEY ("redo_booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL,
  CONSTRAINT "guarantee_claims_status_check" CHECK ("status" IN (
    'waiting_garage', 'needs_detlio', 'redo_approved', 'redo_booked',
    'redo_done', 'refund_approved', 'rejected', 'lapsed'
  )),
  CONSTRAINT "guarantee_claims_route_check" CHECK ("route" IN ('garage', 'detlio', 'auto')),
  CONSTRAINT "guarantee_claims_issues_check" CHECK (
    cardinality("issues") >= 1
    AND "issues" <@ ARRAY['missed_spots', 'water_marks', 'interior_not_cleaned', 'wrong_service', 'other']::text[]
  ),
  CONSTRAINT "guarantee_claims_other_text_check" CHECK (
    NOT ('other' = ANY ("issues")) OR char_length(btrim(coalesce("other_text", ''))) > 0
  ),
  CONSTRAINT "guarantee_claims_route_reasons_check" CHECK (
    "route_reasons" <@ ARRAY['garage_photos', 'no_garage_photos', 'photos_waived', 'first_booking', 'high_claim_rate']::text[]
  ),
  CONSTRAINT "guarantee_claims_garage_response_check" CHECK (
    "garage_response" IS NULL OR "garage_response" IN ('accepted', 'disputed', 'timed_out')
  ),
  -- A dispute always says why.
  CONSTRAINT "guarantee_claims_dispute_note_check" CHECK (
    "garage_response" IS DISTINCT FROM 'disputed' OR char_length(btrim(coalesce("garage_note", ''))) > 0
  ),
  -- Only a claim that went to the garage waits for it.
  CONSTRAINT "guarantee_claims_waiting_garage_check" CHECK (
    "status" <> 'waiting_garage' OR ("route" = 'garage' AND "garage_respond_by" IS NOT NULL)
  ),
  CONSTRAINT "guarantee_claims_decision_check" CHECK (
    ("decision" IS NULL AND "decided_by" IS NULL AND "decided_at" IS NULL)
    OR ("decision" IN ('redo', 'refund', 'reject') AND "decided_by" IS NOT NULL AND "decided_at" IS NOT NULL)
  ),
  -- Not approved always tells the customer why.
  CONSTRAINT "guarantee_claims_reject_reason_check" CHECK (
    "decision" IS DISTINCT FROM 'reject' OR char_length(btrim(coalesce("decision_reason", ''))) > 0
  ),
  CONSTRAINT "guarantee_claims_approved_check" CHECK (
    "approved_at" IS NOT NULL OR "status" IN ('waiting_garage', 'needs_detlio', 'rejected')
  ),
  CONSTRAINT "guarantee_claims_redo_window_check" CHECK (
    "status" NOT IN ('redo_approved', 'redo_booked') OR "redo_book_by" IS NOT NULL
  ),
  CONSTRAINT "guarantee_claims_closed_check" CHECK (
    ("status" IN ('redo_done', 'refund_approved', 'rejected', 'lapsed')) = ("closed_at" IS NOT NULL)
  ),
  CONSTRAINT "guarantee_claims_close_reason_check" CHECK (
    ("closed_at" IS NULL) = ("close_reason" IS NULL)
    AND ("close_reason" IS NULL OR "close_reason" IN ('redo_done', 'redo_no_show', 'redo_not_booked', 'refund', 'rejected'))
  )
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "guarantee_claims_booking_id_key" ON "guarantee_claims" ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guarantee_claims_user_id_created_at_idx" ON "guarantee_claims" ("user_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guarantee_claims_vendor_id_created_at_idx" ON "guarantee_claims" ("vendor_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guarantee_claims_status_idx" ON "guarantee_claims" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guarantee_claims_redo_booking_id_idx" ON "guarantee_claims" ("redo_booking_id") WHERE "redo_booking_id" IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "guarantee_claim_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "claim_id" uuid NOT NULL,
  "storage_key" text NOT NULL,
  "url" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "guarantee_claim_photos_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "guarantee_claims"("id") ON DELETE CASCADE
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "guarantee_claim_photos_storage_key_key" ON "guarantee_claim_photos" ("storage_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guarantee_claim_photos_claim_id_idx" ON "guarantee_claim_photos" ("claim_id");
