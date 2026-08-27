-- Discounts. Admin-created promo codes, typed by the customer at booking time.
-- One code per booking (enforced by the unique booking_id on the redemption
-- table) — there is no stacking and no automatic, code-less discount.
--
-- Money stays numeric(10,2) rupees, matching services.price and bookings.amount.
-- Percentages are plain numeric (20.00 = 20%), capped at 99 because Razorpay
-- rejects a zero-value order: the engine always leaves at least ₹1 payable.
--
-- bookings.amount keeps its meaning — the amount actually charged — so
-- payments.amount, the Razorpay order and the "Pay Now" button are unaffected.
-- The pre-discount figure moves into subtotal_amount, and the invariant is
--   amount = subtotal_amount - discount_amount.
--
-- discount_funded_by is snapshotted onto the booking rather than joined from
-- the discount row: editing a live code's funding must not retroactively
-- rewrite what a garage was already owed for a finished job.

DO $$ BEGIN
  CREATE TYPE "public"."discount_type" AS ENUM('percentage', 'fixed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."discount_funded_by" AS ENUM('platform', 'vendor');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "discounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(40) NOT NULL,
  "description" text,
  "discount_type" "discount_type" NOT NULL,
  "percent_off" numeric(5, 2),
  "amount_off" numeric(10, 2),
  "max_discount_amount" numeric(10, 2),
  "min_order_amount" numeric(10, 2),
  "per_user_limit" integer,
  "total_usage_limit" integer,
  "vendor_id" uuid REFERENCES "vendors"("id") ON DELETE CASCADE,
  "funded_by" "discount_funded_by" DEFAULT 'platform' NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- A malformed row must never reach the engine: the effect columns are
  -- nullable (only one kind applies), so the type decides which is required.
  CONSTRAINT "discounts_percentage_effect_check" CHECK (
    "discount_type" <> 'percentage'
    OR ("percent_off" IS NOT NULL AND "percent_off" > 0 AND "percent_off" <= 99)
  ),
  CONSTRAINT "discounts_fixed_effect_check" CHECK (
    "discount_type" <> 'fixed' OR ("amount_off" IS NOT NULL AND "amount_off" > 0)
  ),
  CONSTRAINT "discounts_window_check" CHECK (
    "ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" > "starts_at"
  ),
  CONSTRAINT "discounts_limits_check" CHECK (
    ("per_user_limit" IS NULL OR "per_user_limit" > 0)
    AND ("total_usage_limit" IS NULL OR "total_usage_limit" > 0)
  )
);--> statement-breakpoint

-- One code namespace, compared case-insensitively: the customer types "save20"
-- and gets the code the admin created as "SAVE20". This index is also what the
-- admin API turns into a 409 DISCOUNT_CODE_TAKEN.
CREATE UNIQUE INDEX IF NOT EXISTS "discounts_code_key" ON "discounts" (lower("code"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discounts_is_active_idx" ON "discounts" ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discounts_vendor_id_idx" ON "discounts" ("vendor_id");--> statement-breakpoint

-- Append-only audit. The discount FK is RESTRICT because the trail outranks
-- convenience: a redeemed code is deactivated, never deleted.
CREATE TABLE IF NOT EXISTS "discount_redemptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "discount_id" uuid NOT NULL REFERENCES "discounts"("id") ON DELETE RESTRICT,
  "booking_id" uuid NOT NULL UNIQUE REFERENCES "bookings"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code" varchar(40) NOT NULL,
  "discount_amount" numeric(10, 2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "discount_redemptions_discount_id_idx" ON "discount_redemptions" ("discount_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discount_redemptions_user_discount_idx" ON "discount_redemptions" ("user_id", "discount_id");--> statement-breakpoint

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "subtotal_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "discount_id" uuid REFERENCES "discounts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "discount_code" varchar(40);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "discount_funded_by" "discount_funded_by";--> statement-breakpoint

-- Every existing booking was charged at full price, so its subtotal is its
-- amount. Backfill before the NOT NULL so the column can be relied on.
UPDATE "bookings" SET "subtotal_amount" = "amount" WHERE "subtotal_amount" IS NULL;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "subtotal_amount" SET NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "bookings_discount_id_idx" ON "bookings" ("discount_id");
