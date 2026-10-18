-- Printed coupons with QR codes. The team prints a batch (cards, flyers, a
-- poster at a garage counter); a customer scans the QR (detlio.com/c/<code>)
-- or types the short code, and the coupon becomes a personal one-use
-- voucher (a Detlio-funded promo code) or, while Detlio Rewards is live,
-- bonus Shine stamps. Rules in lib/coupons.ts; module modules/coupons.
--
-- NUMBERING: written on top of 0054 (feat/rewards-extras). The polish and
-- design branches lined up before this one add no migrations; if one does,
-- renumber this file (and its journal entry) at line-up.
--
-- Changes:
--
--   - `coupon_batches`: the campaign (name, where it is given out), unique
--     codes or one shared code, the reward (₹ off / % off with a cap / a free
--     car wash up to ₹X / bonus stamps), minimum booking, garage or service
--     type, new customers only, the IST days it runs, who made it (typed
--     name), and void. CHECKs tie each reward to its columns.
--   - `coupon_codes`: one row per printed code. Only an HMAC of the code
--     (`code_hash`, unique across batches) and its last four characters are
--     stored; the code itself is re-derived from the batch id, `seq`,
--     `variant` and the coupon secret when the team prints the sheet again.
--     Scans (the /c page opened) are counted here; a unique code records who
--     redeemed it, once.
--   - `coupon_redemptions`: a customer adding a code. Once per customer per
--     code (unique), and once ever for a unique code (partial unique index on
--     the code where `code_kind = 'unique'`, on top of the code row's own
--     conditional update). Names the voucher's `discounts` row, or the
--     bonus stamps given.
--   - `coupon_code_attempts`: wrong codes, per customer and per hashed network
--     address, for the per-hour limits; the cron clears them after a day.
--   - `discounts`: source 'coupon' (a coupon's voucher: Detlio-funded, once,
--     for one customer, never on Home; `discounts_coupon_shape_check`) and
--     `service_category` (a coupon voucher limited to one service type; null
--     on every other code). `discounts_reward_shape_check` is rewritten to
--     apply to 'reward' rows only, which is what it always meant.
--   - `reward_stamps`: source 'coupon' with `coupon_redemption_id` (bonus
--     stamps from a coupon, once per redemption).
--   - `analytics_events`: `coupon_scan` and `coupon_redeem` join the allowed
--     event names (the CHECK is replaced, as 0040 planned for).
--
-- Account deletion: attempts cascade; a redemption keeps its row with the
-- customer SET NULL (the batch's figures stay); a voucher's `discounts` row
-- stays, unusable, as reward vouchers' do. A batch limited to a garage goes
-- with it when the garage is deleted forever (its vouchers' discounts rows
-- cascade with the garage like any garage-only code).
--
-- Purely additive for the 0054 code: new tables, one nullable column, and
-- widened CHECKs that every row today's code writes still passes. Applied
-- by scripts/migrate.sh in one transaction; every statement is safe to
-- re-run.

CREATE TABLE IF NOT EXISTS "coupon_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(80) NOT NULL,
  "location" varchar(120) NOT NULL,
  "kind" text NOT NULL,
  "reward" text NOT NULL,
  "amount_off" numeric(10, 2),
  "percent_off" numeric(5, 2),
  "max_discount" numeric(10, 2),
  "stamps" smallint,
  "min_order_amount" numeric(10, 2),
  "vendor_id" uuid,
  "service_category" "service_category",
  "new_customers_only" boolean DEFAULT false NOT NULL,
  "valid_from" timestamp with time zone NOT NULL,
  "valid_until" timestamp with time zone NOT NULL,
  "code_count" integer NOT NULL,
  "max_redemptions" integer,
  "key_id" varchar(16) NOT NULL,
  "created_by_name" varchar(100) NOT NULL,
  "created_by_sub" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "voided_at" timestamp with time zone,
  "voided_by" varchar(100),
  "void_reason" varchar(300),
  CONSTRAINT "coupon_batches_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "coupon_batches_kind_check" CHECK (
    ("kind" = 'unique' AND "code_count" BETWEEN 1 AND 5000 AND "max_redemptions" IS NULL)
    OR ("kind" = 'shared' AND "code_count" = 1 AND ("max_redemptions" IS NULL OR "max_redemptions" BETWEEN 1 AND 100000))
  ),
  CONSTRAINT "coupon_batches_reward_check" CHECK (
    ("reward" = 'amount' AND "amount_off" > 0 AND "percent_off" IS NULL AND "max_discount" IS NULL AND "stamps" IS NULL)
    OR ("reward" = 'percent' AND "amount_off" IS NULL AND "percent_off" > 0 AND "percent_off" <= 90 AND "max_discount" > 0 AND "stamps" IS NULL)
    OR ("reward" = 'free_wash' AND "amount_off" > 0 AND "percent_off" IS NULL AND "max_discount" IS NULL AND "stamps" IS NULL
        AND "service_category" = 'car_wash')
    OR ("reward" = 'stamps' AND "amount_off" IS NULL AND "percent_off" IS NULL AND "max_discount" IS NULL
        AND "stamps" BETWEEN 1 AND 5 AND "min_order_amount" IS NULL AND "vendor_id" IS NULL AND "service_category" IS NULL)
  ),
  CONSTRAINT "coupon_batches_amounts_check" CHECK (
    ("amount_off" IS NULL OR "amount_off" <= 2000)
    AND ("max_discount" IS NULL OR "max_discount" <= 2000)
    AND ("min_order_amount" IS NULL OR ("min_order_amount" > 0 AND "min_order_amount" <= 10000))
  ),
  CONSTRAINT "coupon_batches_window_check" CHECK ("valid_until" > "valid_from"),
  CONSTRAINT "coupon_batches_name_check" CHECK (
    char_length(btrim("name")) >= 3 AND char_length(btrim("location")) >= 3 AND char_length(btrim("created_by_name")) >= 2
  ),
  CONSTRAINT "coupon_batches_void_check" CHECK (
    ("voided_at" IS NULL) = ("voided_by" IS NULL) AND ("voided_at" IS NULL) = ("void_reason" IS NULL)
  )
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupon_batches_created_at_idx" ON "coupon_batches" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupon_batches_vendor_id_idx" ON "coupon_batches" ("vendor_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "coupon_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "batch_id" uuid NOT NULL,
  "seq" integer NOT NULL,
  "variant" smallint DEFAULT 0 NOT NULL,
  "code_hash" varchar(64) NOT NULL,
  "suffix" varchar(4) NOT NULL,
  "scan_count" integer DEFAULT 0 NOT NULL,
  "first_scanned_at" timestamp with time zone,
  "last_scanned_at" timestamp with time zone,
  "redeemed_at" timestamp with time zone,
  "redeemed_by" uuid,
  "voided_at" timestamp with time zone,
  "voided_by" varchar(100),
  "void_reason" varchar(300),
  CONSTRAINT "coupon_codes_batch_id_coupon_batches_id_fk"
    FOREIGN KEY ("batch_id") REFERENCES "public"."coupon_batches"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "coupon_codes_redeemed_by_users_id_fk"
    FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "coupon_codes_hash_check" CHECK (char_length("code_hash") = 64),
  CONSTRAINT "coupon_codes_seq_check" CHECK ("seq" >= 0 AND "variant" BETWEEN 0 AND 20),
  -- A deleted account leaves redeemed_at with no one named: still used.
  CONSTRAINT "coupon_codes_redeemed_check" CHECK ("redeemed_by" IS NULL OR "redeemed_at" IS NOT NULL),
  CONSTRAINT "coupon_codes_scans_check" CHECK ("scan_count" >= 0 AND ("scan_count" = 0) = ("first_scanned_at" IS NULL)),
  CONSTRAINT "coupon_codes_void_check" CHECK (
    ("voided_at" IS NULL) = ("voided_by" IS NULL) AND ("voided_at" IS NULL) = ("void_reason" IS NULL)
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coupon_codes_code_hash_key" ON "coupon_codes" ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coupon_codes_batch_seq_key" ON "coupon_codes" ("batch_id", "seq");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "coupon_redemptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "batch_id" uuid NOT NULL,
  "code_id" uuid NOT NULL,
  "code_kind" text NOT NULL,
  "user_id" uuid,
  "kind" text NOT NULL,
  "discount_id" uuid,
  "stamps" smallint,
  "channel" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "cancelled_at" timestamp with time zone,
  "cancelled_by" varchar(100),
  "cancel_reason" varchar(300),
  CONSTRAINT "coupon_redemptions_batch_id_coupon_batches_id_fk"
    FOREIGN KEY ("batch_id") REFERENCES "public"."coupon_batches"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "coupon_redemptions_code_id_coupon_codes_id_fk"
    FOREIGN KEY ("code_id") REFERENCES "public"."coupon_codes"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "coupon_redemptions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
  -- SET NULL: a garage-limited voucher's discounts row cascades with its
  -- garage when that is deleted forever, and must not block it.
  CONSTRAINT "coupon_redemptions_discount_id_discounts_id_fk"
    FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "coupon_redemptions_code_kind_check" CHECK ("code_kind" IN ('unique', 'shared')),
  CONSTRAINT "coupon_redemptions_kind_check" CHECK (
    ("kind" = 'voucher' AND "stamps" IS NULL)
    OR ("kind" = 'stamps' AND "discount_id" IS NULL AND "stamps" BETWEEN 1 AND 5)
  ),
  CONSTRAINT "coupon_redemptions_channel_check" CHECK ("channel" IN ('link', 'typed', 'camera')),
  CONSTRAINT "coupon_redemptions_cancelled_check" CHECK (
    ("cancelled_at" IS NULL) = ("cancelled_by" IS NULL) AND ("cancelled_at" IS NULL) = ("cancel_reason" IS NULL)
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coupon_redemptions_code_user_key" ON "coupon_redemptions" ("code_id", "user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coupon_redemptions_unique_code_key"
  ON "coupon_redemptions" ("code_id") WHERE "code_kind" = 'unique';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coupon_redemptions_discount_id_key" ON "coupon_redemptions" ("discount_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupon_redemptions_batch_id_idx" ON "coupon_redemptions" ("batch_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupon_redemptions_user_id_idx" ON "coupon_redemptions" ("user_id", "created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "coupon_code_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "ip_key" varchar(32) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "coupon_code_attempts_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupon_code_attempts_user_id_idx" ON "coupon_code_attempts" ("user_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupon_code_attempts_ip_key_idx" ON "coupon_code_attempts" ("ip_key", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupon_code_attempts_created_at_idx" ON "coupon_code_attempts" ("created_at");--> statement-breakpoint

-- ─── discounts: a coupon's voucher ───────────────────────────────────────────

ALTER TABLE "discounts" ADD COLUMN IF NOT EXISTS "service_category" "service_category";--> statement-breakpoint
ALTER TABLE "discounts" DROP CONSTRAINT IF EXISTS "discounts_source_check";--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_source_check" CHECK ("source" IN ('admin', 'reward', 'coupon'));--> statement-breakpoint
-- 0050 wrote it as "admin, or the reward shape"; it is about reward rows.
ALTER TABLE "discounts" DROP CONSTRAINT IF EXISTS "discounts_reward_shape_check";--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_reward_shape_check" CHECK (
  "source" <> 'reward'
  OR (
    "funded_by" = 'platform'
    AND "vendor_id" IS NULL
    AND NOT "show_on_home"
    AND "discount_type" = 'fixed'
    AND "total_usage_limit" = 1
    AND "per_user_limit" = 1
    AND "ends_at" IS NOT NULL
  )
);--> statement-breakpoint
-- A coupon's voucher is Detlio's cost, once, for one customer, never an
-- offer card on Home; it may be a % off and may name a garage.
ALTER TABLE "discounts" DROP CONSTRAINT IF EXISTS "discounts_coupon_shape_check";--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_coupon_shape_check" CHECK (
  "source" <> 'coupon'
  OR (
    "funded_by" = 'platform'
    AND NOT "show_on_home"
    AND "total_usage_limit" = 1
    AND "per_user_limit" = 1
    AND "ends_at" IS NOT NULL
  )
);--> statement-breakpoint
ALTER TABLE "discounts" DROP CONSTRAINT IF EXISTS "discounts_service_category_check";--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_service_category_check"
  CHECK ("service_category" IS NULL OR "source" = 'coupon');--> statement-breakpoint

-- ─── reward_stamps: bonus stamps from a coupon ───────────────────────────────

ALTER TABLE "reward_stamps" ADD COLUMN IF NOT EXISTS "coupon_redemption_id" uuid;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reward_stamps_coupon_redemption_id_fk') THEN
    ALTER TABLE "reward_stamps" ADD CONSTRAINT "reward_stamps_coupon_redemption_id_fk"
      FOREIGN KEY ("coupon_redemption_id") REFERENCES "public"."coupon_redemptions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reward_stamps_coupon_redemption_idx"
  ON "reward_stamps" ("coupon_redemption_id") WHERE "source" = 'coupon';--> statement-breakpoint
ALTER TABLE "reward_stamps" DROP CONSTRAINT IF EXISTS "reward_stamps_source_check";--> statement-breakpoint
ALTER TABLE "reward_stamps" ADD CONSTRAINT "reward_stamps_source_check"
  CHECK ("source" IN ('booking', 'scratch', 'streak', 'adjustment', 'badge', 'challenge', 'coupon'));--> statement-breakpoint
ALTER TABLE "reward_stamps" DROP CONSTRAINT IF EXISTS "reward_stamps_source_fields_check";--> statement-breakpoint
ALTER TABLE "reward_stamps" ADD CONSTRAINT "reward_stamps_source_fields_check" CHECK (
  ("source" = 'booking') = ("booking_id" IS NOT NULL)
  AND ("source" = 'scratch') = ("scratch_card_id" IS NOT NULL)
  AND ("source" = 'streak') = ("streak_month" IS NOT NULL)
  AND ("source" = 'badge') = ("badge_award_id" IS NOT NULL)
  AND ("source" = 'challenge') = ("challenge_id" IS NOT NULL)
  AND ("source" = 'coupon') = ("coupon_redemption_id" IS NOT NULL)
  AND ("source" <> 'adjustment' OR ("reason" IS NOT NULL AND "actor_name" IS NOT NULL))
);--> statement-breakpoint

-- ─── analytics_events: coupon_scan, coupon_redeem ────────────────────────────

ALTER TABLE "analytics_events" DROP CONSTRAINT IF EXISTS "analytics_events_name_check";--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_name_check" CHECK (
  "name" IN ('app_open', 'home_view', 'garage_list_view', 'search', 'map_view',
             'garage_view', 'service_add', 'checkout_start', 'slot_select',
             'address_select', 'pay_click', 'booking_paid', 'booking_cancelled',
             'review_submit', 'complaint_submit', 'help_view',
             'favourite_add', 'favourite_remove', 'coupon_scan', 'coupon_redeem')
);
