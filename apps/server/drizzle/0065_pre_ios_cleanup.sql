-- Pre-iOS, part A: admin, money and ratings (owner, 29 Oct 2026: "I need
-- everything to be deletable as sometimes the team can do test runs ... These
-- should never be counted towards our rating").
--
-- Changes:
--
--   - `deleted_test_payments`: a hidden ledger. A Test-marked booking that
--     took real money may now be deleted as a team test once every rupee
--     taken on it was refunded (lib/data-reset.ts); before its rows go, one
--     row per payment is written here (the booking reference, Razorpay
--     payment and order ids, the amount, every refund, the receipt number,
--     who deleted it and their typed reason). No foreign key to the booking:
--     it is gone. Append-only, like admin_audit_log; nothing shows it on
--     screen.
--   - `reviews.tags` (a fixed list: good ones for 4-5 stars, problems for
--     1-3, lib/ratings.ts), the garage's one public reply (`reply`,
--     `replied_at`, `reply_updated_at`, `replied_by`), and admin's hide
--     (`hidden_at`, `hidden_by`, `hidden_reason`). A hidden review leaves
--     every score and list but stays in the record.
--   - `review_reports`: a customer or the garage reported a review to the
--     team, with a reason. One per person and review.
--   - `complaints.error_marked_at` / `error_marked_by` / `error_reason`: a
--     complaint the team logged by mistake ("Logged in error"). Kept, but out
--     of every count; only for team-logged complaints (never `app`). Undoing
--     it clears the three.
--   - `booking_notes.kind` (`typed` by a person, `system` written by an
--     action), `author_sub` (whose session typed it) and `edited_at`. Every
--     existing note is `system`: nothing tells a typed one apart, and the
--     24-hour edit window has passed for almost all of them anyway.
--
-- Additive: the code in production writes none of these and reads none of
-- them; every new column has a default or is nullable.
CREATE TABLE IF NOT EXISTS "deleted_test_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "root_booking_id" uuid NOT NULL,
  "booking_reference" varchar(8) NOT NULL,
  "booking_ids" uuid[] NOT NULL,
  "kind" text NOT NULL,
  "charge_id" uuid,
  "razorpay_payment_id" varchar(255),
  "razorpay_order_id" varchar(255),
  "gateway_mode" text,
  "amount" numeric(10, 2) NOT NULL,
  "refunded_amount" numeric(10, 2) NOT NULL,
  "refunds" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "receipt_number" varchar(20),
  "vendor_id" uuid,
  "garage_name" varchar(255),
  "customer_id" uuid,
  "paid_at" timestamp with time zone,
  "booked_at" timestamp with time zone NOT NULL,
  "reason" varchar(300) NOT NULL,
  "deleted_by_name" varchar(100) NOT NULL,
  "deleted_by_sub" varchar(100) NOT NULL,
  "audit_id" uuid NOT NULL,
  "deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "deleted_test_payments_audit_id_admin_audit_log_id_fk"
    FOREIGN KEY ("audit_id") REFERENCES "public"."admin_audit_log"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "deleted_test_payments_kind_check"
    CHECK ("kind" IN ('booking', 'final_bill', 'extra_work')),
  CONSTRAINT "deleted_test_payments_gateway_mode_check"
    CHECK ("gateway_mode" IS NULL OR "gateway_mode" IN ('live', 'test', 'fake')),
  CONSTRAINT "deleted_test_payments_amount_check"
    CHECK ("amount" > 0 AND "refunded_amount" >= "amount"),
  CONSTRAINT "deleted_test_payments_reason_check"
    CHECK (char_length(btrim("reason")) >= 3),
  CONSTRAINT "deleted_test_payments_refunds_check"
    CHECK (jsonb_typeof("refunds") = 'array')
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deleted_test_payments_deleted_at_idx"
  ON "deleted_test_payments" ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deleted_test_payments_payment_idx"
  ON "deleted_test_payments" ("razorpay_payment_id")
  WHERE "razorpay_payment_id" IS NOT NULL;--> statement-breakpoint
-- Append-only, held by the database as well as the code (as admin_audit_log).
CREATE OR REPLACE FUNCTION "deleted_test_payments_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'deleted_test_payments is append-only';
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "deleted_test_payments_append_only" ON "deleted_test_payments";--> statement-breakpoint
CREATE TRIGGER "deleted_test_payments_append_only"
  BEFORE UPDATE OR DELETE ON "deleted_test_payments"
  FOR EACH ROW EXECUTE FUNCTION "deleted_test_payments_append_only"();--> statement-breakpoint

-- Reviews: tags, the garage's reply, admin's hide.
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "reply" varchar(1000);--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "reply_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "replied_by" uuid;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "hidden_by" varchar(100);--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "hidden_reason" varchar(300);--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_replied_by_users_id_fk"
  FOREIGN KEY ("replied_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Good tags only with 4-5 stars, problems only with 1-3 (lib/ratings.ts).
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tags_check"
  CHECK (
    cardinality("tags") <= 8 AND (
      ("rating" >= 4 AND "tags" <@ ARRAY['on_time', 'spotless_finish', 'friendly', 'good_value']::text[])
      OR ("rating" <= 3 AND "tags" <@ ARRAY['missed_spots', 'late', 'damp_interior', 'rude']::text[])
    )
  );--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reply_check"
  CHECK (
    ("reply" IS NULL) = ("replied_at" IS NULL)
    AND ("reply" IS NULL OR char_length(btrim("reply")) >= 1)
    AND ("reply_updated_at" IS NULL OR "replied_at" IS NOT NULL)
  );--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_check"
  CHECK (
    ("hidden_at" IS NULL AND "hidden_by" IS NULL AND "hidden_reason" IS NULL)
    OR ("hidden_at" IS NOT NULL AND "hidden_by" IS NOT NULL AND "hidden_reason" IS NOT NULL)
  );--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "review_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "review_id" uuid NOT NULL,
  "reporter" text NOT NULL,
  "user_id" uuid,
  "vendor_id" uuid,
  "reason" varchar(500) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "review_reports_review_id_reviews_id_fk"
    FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "review_reports_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "review_reports_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "review_reports_reporter_check"
    CHECK ("reporter" IN ('customer', 'garage') AND (("reporter" = 'garage') = ("vendor_id" IS NOT NULL))),
  CONSTRAINT "review_reports_reason_check"
    CHECK (char_length(btrim("reason")) BETWEEN 3 AND 500)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_reports_review_id_idx" ON "review_reports" ("review_id");--> statement-breakpoint
-- One report per person and review (a garage reports once, whoever presses).
CREATE UNIQUE INDEX IF NOT EXISTS "review_reports_user_key"
  ON "review_reports" ("review_id", "user_id")
  WHERE "reporter" = 'customer' AND "user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "review_reports_garage_key"
  ON "review_reports" ("review_id", "vendor_id")
  WHERE "reporter" = 'garage';--> statement-breakpoint

-- Complaints: "Logged in error" (team-logged only).
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "error_marked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "error_marked_by" varchar(100);--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "error_reason" varchar(300);--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_logged_in_error_check"
  CHECK (
    ("error_marked_at" IS NULL AND "error_marked_by" IS NULL AND "error_reason" IS NULL)
    OR ("error_marked_at" IS NOT NULL AND "error_marked_by" IS NOT NULL AND "error_reason" IS NOT NULL AND "source" <> 'app')
  );--> statement-breakpoint

-- Booking notes: typed or written by the system, whose session typed it.
ALTER TABLE "booking_notes" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_notes" ADD COLUMN IF NOT EXISTS "author_sub" varchar(100);--> statement-breakpoint
ALTER TABLE "booking_notes" ADD COLUMN IF NOT EXISTS "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_notes" ADD CONSTRAINT "booking_notes_kind_check"
  CHECK ("kind" IN ('typed', 'system') AND ("kind" = 'system' OR "author_sub" IS NOT NULL) AND ("edited_at" IS NULL OR "kind" = 'typed'));
