-- The pickup fee (owner-approved screens, 15 Nov 2026; maths in
-- lib/pickup-fee-maths.ts, twinned in packages/core). Each garage picks
-- Free (the default: how pickup works today), a fixed fee or By distance;
-- Detlio's suggested formula, the limits garages work within and Detlio's
-- own convenience fee (₹0, off) are admin settings.
--
--   vendors.pickup_fee_*        the garage's choice. A null distance number
--                               is Detlio's. `waiting_since`: a fee above
--                               Detlio's suggestion not checked yet (customers
--                               see Detlio's fee meanwhile). `locked_*`:
--                               admin's "Lock to Detlio's fee". `changed_at`:
--                               the garage's own last change (once in 7 days).
--   pickup_fee_changes          every change, with who, when, before → after,
--                               and Detlio's check (waiting / approved / kept).
--   bookings / booking_intents  `travel_fee` now also carries the pickup fee
--                               (any whole ₹0–₹599, the hard cap; old rows are
--                               0, 100 or 200 and stay valid), `road_km` the
--                               road km it was worked out on, and
--                               `convenience_fee` Detlio's own fee. Both fees
--                               are inside `subtotal_amount`, so
--                               amount = subtotal − discount still holds; no
--                               promo comes off either, the garage keeps the
--                               pickup fee whole and never gets the
--                               convenience fee (lib/payouts.ts).
--   booking_requests            the suggestion worked out when the request was
--                               made (`suggested_fee`, `max_fee`, `road_km`);
--                               the garage's yes is ₹0 up to `max_fee`. Old
--                               rows have none and keep their ₹0/₹100/₹200.
--                               `pickup_terms_accepted_at`: the garage's
--                               responsibility tick with an Ask for pickup's yes.
--   admin_settings 'pickup_fee' the formula, limits and convenience fee.
--   bypass_reports.kind         + 'pickup_money', "Asked for extra pickup money".
--
-- Additive for today's API: every garage reads Free, every booking ₹0 of
-- convenience fee, and the wider CHECKs accept every row written so far.
-- Applied by scripts/migrate.sh, one transaction per file. Safe to re-run.

-- ─── The garage's choice ─────────────────────────────────────────────────────

ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_fee_mode" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_fee_fixed" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_fee_free_km" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_fee_per_km" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_fee_min" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_fee_max" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_fee_waiting_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_fee_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_fee_locked_by" varchar(100);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "pickup_fee_changed_at" timestamp with time zone;--> statement-breakpoint

-- The hard caps, whatever admin's limits say: fixed ≤ ₹299; free km 0–5,
-- ₹5–₹30 a km, lowest ₹49–₹149, highest ≤ ₹599.
ALTER TABLE "vendors" DROP CONSTRAINT IF EXISTS "vendors_pickup_fee_check";--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_pickup_fee_check" CHECK (
  "pickup_fee_mode" IN ('free', 'fixed', 'distance')
  AND ("pickup_fee_mode" <> 'fixed' OR ("pickup_fee_fixed" IS NOT NULL AND "pickup_fee_fixed" >= 1))
  AND ("pickup_fee_fixed" IS NULL OR ("pickup_fee_fixed" >= 0 AND "pickup_fee_fixed" <= 299))
  AND ("pickup_fee_free_km" IS NULL OR ("pickup_fee_free_km" >= 0 AND "pickup_fee_free_km" <= 5))
  AND ("pickup_fee_per_km" IS NULL OR ("pickup_fee_per_km" >= 5 AND "pickup_fee_per_km" <= 30))
  AND ("pickup_fee_min" IS NULL OR ("pickup_fee_min" >= 49 AND "pickup_fee_min" <= 149))
  AND ("pickup_fee_max" IS NULL OR ("pickup_fee_max" >= 1 AND "pickup_fee_max" <= 599))
  AND (("pickup_fee_locked_at" IS NULL) = ("pickup_fee_locked_by" IS NULL))
);--> statement-breakpoint

-- ─── Every change, and Detlio's check ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pickup_fee_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  -- 'fee' a change of the fee; 'locked' / 'unlocked' admin's lock.
  "kind" text DEFAULT 'fee' NOT NULL,
  -- 'garage' (a seat in the portal or app) or 'detlio' (admin).
  "by_kind" text NOT NULL,
  "by_user_id" uuid,
  "by_name" varchar(120) NOT NULL,
  -- The fee before and after: { mode, fixed, freeKm, perKm, minCharge, maxCharge }.
  "before" jsonb NOT NULL,
  "after" jsonb NOT NULL,
  -- 'live' went live at once; 'waiting' above the suggestion, to check;
  -- then 'approved' or 'kept' (Detlio kept its own fee, with a reason the
  -- garage sees), or 'replaced' when a newer change took its place first.
  "status" text DEFAULT 'live' NOT NULL,
  "decided_at" timestamp with time zone,
  "decided_by" varchar(100),
  "decision_reason" varchar(300),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pickup_fee_changes_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "pickup_fee_changes_by_user_id_users_id_fk"
    FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "pickup_fee_changes_kind_check" CHECK ("kind" IN ('fee', 'locked', 'unlocked')),
  CONSTRAINT "pickup_fee_changes_by_kind_check" CHECK ("by_kind" IN ('garage', 'detlio')),
  CONSTRAINT "pickup_fee_changes_status_check" CHECK ("status" IN ('live', 'waiting', 'approved', 'kept', 'replaced')),
  CONSTRAINT "pickup_fee_changes_shape_check" CHECK (
    jsonb_typeof("before") = 'object' AND jsonb_typeof("after") = 'object'
    AND ("status" <> 'waiting' OR ("by_kind" = 'garage' AND "kind" = 'fee'))
    AND (("status" IN ('approved', 'kept')) = ("decided_at" IS NOT NULL AND "decided_by" IS NOT NULL))
    AND ("status" <> 'kept' OR "decision_reason" IS NOT NULL)
  )
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pickup_fee_changes_vendor_idx" ON "pickup_fee_changes" ("vendor_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pickup_fee_changes_status_idx" ON "pickup_fee_changes" ("status", "created_at")
  WHERE "status" IN ('waiting', 'approved', 'kept');--> statement-breakpoint
-- At most one fee waiting per garage: a new one replaces it (written in one transaction).
CREATE UNIQUE INDEX IF NOT EXISTS "pickup_fee_changes_one_waiting_key" ON "pickup_fee_changes" ("vendor_id")
  WHERE "status" = 'waiting';--> statement-breakpoint

-- ─── The fees on the booking and its checkout ────────────────────────────────

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "convenience_fee" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "road_km" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_travel_fee_check";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_travel_fee_check"
  CHECK ("travel_fee" >= 0 AND "travel_fee" <= 599);--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_convenience_fee_check";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_convenience_fee_check"
  CHECK ("convenience_fee" >= 0 AND "convenience_fee" <= 99);--> statement-breakpoint

ALTER TABLE "booking_intents" ADD COLUMN IF NOT EXISTS "convenience_fee" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_intents" ADD COLUMN IF NOT EXISTS "road_km" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "booking_intents" DROP CONSTRAINT IF EXISTS "booking_intents_travel_fee_check";--> statement-breakpoint
ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_travel_fee_check"
  CHECK ("travel_fee" >= 0 AND "travel_fee" <= 599);--> statement-breakpoint
ALTER TABLE "booking_intents" DROP CONSTRAINT IF EXISTS "booking_intents_convenience_fee_check";--> statement-breakpoint
ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_convenience_fee_check"
  CHECK ("convenience_fee" >= 0 AND "convenience_fee" <= 99);--> statement-breakpoint

-- ─── Ask for pickup / Request a visit: the suggestion ───────────────────────

ALTER TABLE "booking_requests" ADD COLUMN IF NOT EXISTS "suggested_fee" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "booking_requests" ADD COLUMN IF NOT EXISTS "max_fee" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "booking_requests" ADD COLUMN IF NOT EXISTS "road_km" numeric(5, 1);--> statement-breakpoint
-- Ask for pickup: the garage's responsibility tick with its yes (a garage that
-- doesn't offer pickup has none on file).
ALTER TABLE "booking_requests" ADD COLUMN IF NOT EXISTS "pickup_terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_requests" DROP CONSTRAINT IF EXISTS "booking_requests_travel_fee_check";--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_travel_fee_check"
  CHECK ("travel_fee" IS NULL OR ("travel_fee" >= 0 AND "travel_fee" <= 599));--> statement-breakpoint
ALTER TABLE "booking_requests" DROP CONSTRAINT IF EXISTS "booking_requests_suggested_fee_check";--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_suggested_fee_check" CHECK (
  ("suggested_fee" IS NULL) = ("max_fee" IS NULL)
  AND ("suggested_fee" IS NULL OR ("suggested_fee" >= 0 AND "max_fee" >= "suggested_fee" AND "max_fee" <= 599))
);--> statement-breakpoint

-- ─── Admin settings and the new report reason ───────────────────────────────

ALTER TABLE "admin_settings" DROP CONSTRAINT IF EXISTS "admin_settings_key_check";--> statement-breakpoint
ALTER TABLE "admin_settings" ADD CONSTRAINT "admin_settings_key_check"
  CHECK ("key" IN ('garage_target', 'colour_names', 'other_towns_visible', 'pickup_fee'));--> statement-breakpoint

ALTER TABLE "bypass_reports" DROP CONSTRAINT IF EXISTS "bypass_reports_kind_check";--> statement-breakpoint
ALTER TABLE "bypass_reports" ADD CONSTRAINT "bypass_reports_kind_check"
  CHECK ("kind" IN ('book_directly', 'lower_price', 'pay_directly', 'gave_number', 'pickup_money', 'other'));
