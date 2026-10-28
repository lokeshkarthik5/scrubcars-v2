-- Customer reach, part 1: Chennai's zones (owner, 28 Oct 2026: "the landing
-- page becomes the app"; location is asked as an area chip, never a cold
-- GPS popup).
--
--   - `zones`: an area of Chennai as a centre and a name. A point (a
--     garage's pin, a customer's area) belongs to the nearest zone centre
--     within 6 km, and to no zone otherwise (`zoneFor`,
--     apps/server/src/lib/zones.ts). Nothing is drawn and no garage stores
--     its zone: it is worked out from the pin on read.
--   - `priority`: the owner's seven priority areas, the landing page's
--     chips. `target`: how many listed garages the team wants in the zone
--     (5 until admin edits zones, PR 5). `live_at`: when the zone first had
--     a live garage, set by the next part of this release (launch day);
--     null until then.
--   - Seeded with the owner's 25 areas. The same list is in
--     apps/server/src/lib/zones.ts (CHENNAI_ZONES; zones.test.ts holds this
--     file to it) and in the customer app's fallback
--     (packages/core/src/zones.ts, zones.parity.test.ts).
--
-- Part 1 holds no personal data (part 2, below, says what it keeps).
-- Additive: new tables, columns and rows. Applied by scripts/migrate.sh in
-- one transaction; every statement is safe to re-run.

CREATE TABLE IF NOT EXISTS "zones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(60) NOT NULL,
  "name" varchar(60) NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "priority" boolean DEFAULT false NOT NULL,
  "target" integer DEFAULT 5 NOT NULL,
  "live_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "zones_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT "zones_name_check" CHECK (length(btrim("name")) BETWEEN 2 AND 60),
  CONSTRAINT "zones_lat_check" CHECK ("lat" BETWEEN -90 AND 90),
  CONSTRAINT "zones_lng_check" CHECK ("lng" BETWEEN -180 AND 180),
  CONSTRAINT "zones_target_check" CHECK ("target" BETWEEN 1 AND 1000)
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "zones_slug_key" ON "zones" ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "zones_name_key" ON "zones" (lower("name"));--> statement-breakpoint

INSERT INTO "zones" ("slug", "name", "lat", "lng", "priority")
VALUES
  ('adyar', 'Adyar', 13.0012, 80.2565, true),
  ('nungambakkam', 'Nungambakkam', 13.0569, 80.2425, true),
  ('anna-nagar', 'Anna Nagar', 13.085, 80.2101, true),
  ('sholinganallur', 'Sholinganallur', 12.901, 80.2279, true),
  ('navalur', 'Navalur', 12.8459, 80.2265, true),
  ('guindy', 'Guindy', 13.0067, 80.2206, true),
  ('t-nagar', 'T Nagar', 13.0418, 80.2341, true),
  ('velachery', 'Velachery', 12.9815, 80.218, false),
  ('mylapore', 'Mylapore', 13.0368, 80.2676, false),
  ('kilpauk', 'Kilpauk', 13.085, 80.242, false),
  ('egmore', 'Egmore', 13.0732, 80.2609, false),
  ('porur', 'Porur', 13.0382, 80.1565, false),
  ('vadapalani', 'Vadapalani', 13.05, 80.2121, false),
  ('kodambakkam', 'Kodambakkam', 13.0524, 80.2255, false),
  ('chromepet', 'Chromepet', 12.9516, 80.1462, false),
  ('tambaram', 'Tambaram', 12.9249, 80.1, false),
  ('pallikaranai', 'Pallikaranai', 12.9349, 80.2137, false),
  ('medavakkam', 'Medavakkam', 12.9171, 80.1923, false),
  ('perungudi', 'Perungudi', 12.9654, 80.2461, false),
  ('thiruvanmiyur', 'Thiruvanmiyur', 12.983, 80.2594, false),
  ('ambattur', 'Ambattur', 13.1143, 80.1548, false),
  ('perambur', 'Perambur', 13.121, 80.2329, false),
  ('royapettah', 'Royapettah', 13.054, 80.264, false),
  ('kotturpuram', 'Kotturpuram', 13.02, 80.2415, false),
  ('ashok-nagar', 'Ashok Nagar', 13.0359, 80.2121, false)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

-- ═══ Customer reach, part 2 (owner, 28–29 Oct 2026) ════════════════════════
--
--   - `booking_requests`: "Request a visit" / "Request a pickup" on a garage
--     whose reach stops short of the customer (within 15 km past it). Nothing
--     is paid; the garage has 2 hours to say yes (with a travel fee of ₹0,
--     ₹100 or ₹200 and a start time inside the customer's window) or no. No
--     answer, or no, passes the same details to the next nearest garage, at
--     most two garages a request (`chain_no`, `forwarded_from_id`,
--     `root_request_id`). A yes gives the customer 2 hours to confirm and
--     pay (`confirm_by`); the booking it becomes is `booking_id`. Rules in
--     lib/booking-requests.ts. Only the address's id and pin are kept (the
--     garage sees the zone and the distance until it is a booking), and its
--     services as they were priced (`items`).
--   - `zone_signups`: "Free wash when we reach <Area>": a customer on a
--     zone's list, once per zone. The first 50 of a zone (`position`) get a
--     free wash when the zone goes live: a Detlio-funded promo code
--     (`discounts.source = 'free_wash'`, `discount_id`). The push and
--     WhatsApp opt-ins (WhatsApp is stored only; nothing is sent yet) and
--     one marker per message, so nothing is sent twice.
--   - `garage_recommendations`: "Know a good garage here?": a lead for the
--     team (status new → contacted → joined / declined; `vendor_id` linked
--     by admin later), and the ₹100 referral credit once the customer books
--     it (`credit_*`, gift_credit_entries kind `referral_reward`).
--   - `bookings.travel_fee` / `booking_intents.travel_fee`: an accepted
--     request's travel fee, its own line, kept whole by the garage.
--     `booking_intents.request_id`: the request a checkout confirms.
--   - `discounts`: source 'free_wash' (Detlio-funded, fixed ₹ off, once, for
--     one customer, car washes only).
--
-- Personal data: a request keeps the address's id and pin (deleted with the
-- account); a sign-up the customer's zone and opt-ins (deleted with the
-- account); a recommendation is about a business and stays as a lead with
-- the customer SET NULL. Every table is new, so additive; the CHECKs widened
-- pass every row today's code writes. Safe to re-run.

CREATE TABLE IF NOT EXISTS "booking_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "vendor_id" uuid NOT NULL,
  "root_request_id" uuid,
  "forwarded_from_id" uuid,
  "chain_no" smallint DEFAULT 1 NOT NULL,
  "booking_type" text NOT NULL,
  "vehicle_id" uuid,
  "vehicle_type" varchar(20) NOT NULL,
  "address_id" uuid,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "zone_slug" varchar(60),
  "distance_km" numeric(6, 1) NOT NULL,
  "cover_km" numeric(6, 1),
  "outside_km" numeric(6, 1) NOT NULL,
  "items" jsonb NOT NULL,
  "subtotal_amount" numeric(10, 2) NOT NULL,
  "duration_mins" integer NOT NULL,
  "window_date" date NOT NULL,
  "window_part" text NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "window_end" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "respond_by" timestamp with time zone NOT NULL,
  "reply" text,
  "replied_at" timestamp with time zone,
  "replied_by" uuid,
  "travel_fee" numeric(10, 2),
  "accepted_start_at" timestamp with time zone,
  "confirm_by" timestamp with time zone,
  "booking_id" uuid,
  "ops_alerted_at" timestamp with time zone,
  "customer_told_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "booking_requests_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "booking_requests_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "booking_requests_root_request_id_fk"
    FOREIGN KEY ("root_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "booking_requests_forwarded_from_id_fk"
    FOREIGN KEY ("forwarded_from_id") REFERENCES "public"."booking_requests"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "booking_requests_vehicle_id_user_vehicles_id_fk"
    FOREIGN KEY ("vehicle_id") REFERENCES "public"."user_vehicles"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "booking_requests_address_id_user_addresses_id_fk"
    FOREIGN KEY ("address_id") REFERENCES "public"."user_addresses"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "booking_requests_replied_by_users_id_fk"
    FOREIGN KEY ("replied_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "booking_requests_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "booking_requests_booking_type_check" CHECK ("booking_type" IN ('doorstep', 'pickup')),
  CONSTRAINT "booking_requests_vehicle_type_check" CHECK ("vehicle_type" IN ('hatchback', 'sedan', 'suv')),
  CONSTRAINT "booking_requests_status_check"
    CHECK ("status" IN ('pending', 'accepted', 'declined', 'expired', 'forwarded', 'cancelled', 'converted')),
  CONSTRAINT "booking_requests_window_part_check" CHECK ("window_part" IN ('morning', 'afternoon', 'evening')),
  CONSTRAINT "booking_requests_window_check" CHECK ("window_end" > "window_start"),
  CONSTRAINT "booking_requests_chain_check" CHECK (
    "chain_no" BETWEEN 1 AND 2
    AND (("chain_no" = 1) = ("forwarded_from_id" IS NULL AND "root_request_id" IS NULL))
  ),
  CONSTRAINT "booking_requests_reply_check" CHECK (
    ("reply" IS NULL OR "reply" IN ('accepted', 'declined'))
    AND (("reply" IS NULL) = ("replied_at" IS NULL))
  ),
  -- A yes always carries its fee, its start time and the customer's deadline.
  CONSTRAINT "booking_requests_accept_check" CHECK (
    (COALESCE("reply", '') = 'accepted')
      = ("travel_fee" IS NOT NULL AND "accepted_start_at" IS NOT NULL AND "confirm_by" IS NOT NULL)
  ),
  CONSTRAINT "booking_requests_travel_fee_check" CHECK ("travel_fee" IS NULL OR "travel_fee" IN (0, 100, 200)),
  CONSTRAINT "booking_requests_status_reply_check" CHECK (
    ("status" NOT IN ('accepted', 'converted') OR "reply" = 'accepted')
    AND ("status" <> 'declined' OR "reply" = 'declined')
    AND ("status" <> 'pending' OR "reply" IS NULL)
  ),
  CONSTRAINT "booking_requests_amounts_check" CHECK ("subtotal_amount" > 0 AND "duration_mins" > 0),
  CONSTRAINT "booking_requests_distance_check" CHECK ("distance_km" >= 0 AND "outside_km" >= 0)
);--> statement-breakpoint

-- A customer's own requests; a garage's inbox; the cron's two clocks; admin's
-- demand per zone (PR 5) by zone, status and time.
CREATE INDEX IF NOT EXISTS "booking_requests_user_status_idx" ON "booking_requests" ("user_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_requests_vendor_status_idx" ON "booking_requests" ("vendor_id", "status", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_requests_respond_by_idx" ON "booking_requests" ("respond_by") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_requests_confirm_by_idx" ON "booking_requests" ("confirm_by") WHERE "status" = 'accepted';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_requests_zone_idx" ON "booking_requests" ("zone_slug", "status", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_requests_created_at_idx" ON "booking_requests" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_requests_root_idx" ON "booking_requests" ("root_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "booking_requests_booking_id_key" ON "booking_requests" ("booking_id") WHERE "booking_id" IS NOT NULL;--> statement-breakpoint
-- One garage at a time per request: one open row per chain.
CREATE UNIQUE INDEX IF NOT EXISTS "booking_requests_one_open_key"
  ON "booking_requests" (COALESCE("root_request_id", "id")) WHERE "status" IN ('pending', 'accepted');--> statement-breakpoint

-- A zone is never deleted from under its sign-ups or leads: zone FKs are
-- ON DELETE RESTRICT (admin may remove a zone only once nothing names it).
CREATE TABLE IF NOT EXISTS "zone_signups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "zone_id" uuid NOT NULL,
  "position" integer NOT NULL,
  "free_wash" boolean NOT NULL,
  "push_opt_in" boolean DEFAULT false NOT NULL,
  "whatsapp_opt_in" boolean DEFAULT false NOT NULL,
  "whatsapp_opt_in_at" timestamp with time zone,
  "discount_id" uuid,
  "free_wash_issued_at" timestamp with time zone,
  "launch_push_at" timestamp with time zone,
  "coverage_push_at" timestamp with time zone,
  "reminder_push_at" timestamp with time zone,
  "launch_banner_seen_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "zone_signups_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "zone_signups_zone_id_zones_id_fk"
    FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "zone_signups_discount_id_discounts_id_fk"
    FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "zone_signups_position_check" CHECK ("position" >= 1),
  CONSTRAINT "zone_signups_free_wash_check" CHECK (NOT "free_wash" OR "position" <= 50),
  CONSTRAINT "zone_signups_issued_check" CHECK ("free_wash" OR "discount_id" IS NULL),
  CONSTRAINT "zone_signups_whatsapp_check" CHECK ("whatsapp_opt_in" = ("whatsapp_opt_in_at" IS NOT NULL))
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "zone_signups_user_zone_key" ON "zone_signups" ("user_id", "zone_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "zone_signups_zone_position_key" ON "zone_signups" ("zone_id", "position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zone_signups_zone_created_idx" ON "zone_signups" ("zone_id", "created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_recommendations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "zone_id" uuid,
  "name" varchar(100) NOT NULL,
  "maps_link" varchar(500),
  "phone" varchar(10),
  "why" varchar(500),
  "status" text DEFAULT 'new' NOT NULL,
  "vendor_id" uuid,
  "credit_status" text,
  "credit_amount" numeric(10, 2),
  "credit_entry_id" uuid,
  "credit_booking_id" uuid,
  "credited_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_recommendations_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_recommendations_zone_id_zones_id_fk"
    FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "garage_recommendations_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_recommendations_credit_entry_id_fk"
    FOREIGN KEY ("credit_entry_id") REFERENCES "public"."gift_credit_entries"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "garage_recommendations_credit_booking_id_fk"
    FOREIGN KEY ("credit_booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_recommendations_name_check" CHECK (length(btrim("name")) BETWEEN 2 AND 100),
  CONSTRAINT "garage_recommendations_contact_check" CHECK ("maps_link" IS NOT NULL OR "phone" IS NOT NULL),
  CONSTRAINT "garage_recommendations_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^[6-9][0-9]{9}$'),
  CONSTRAINT "garage_recommendations_link_check" CHECK ("maps_link" IS NULL OR "maps_link" ~ '^https://'),
  CONSTRAINT "garage_recommendations_status_check" CHECK ("status" IN ('new', 'contacted', 'joined', 'declined')),
  CONSTRAINT "garage_recommendations_credit_check" CHECK (
    ("credit_status" IS NULL OR "credit_status" IN ('owed', 'granted'))
    AND (("credit_status" IS NULL) = ("credit_amount" IS NULL))
    AND (("credit_status" = 'granted') = ("credit_entry_id" IS NOT NULL AND "credited_at" IS NOT NULL))
  )
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_recommendations_zone_idx" ON "garage_recommendations" ("zone_id", "status", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "garage_recommendations_user_idx" ON "garage_recommendations" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "garage_recommendations_vendor_idx" ON "garage_recommendations" ("vendor_id") WHERE "vendor_id" IS NOT NULL;--> statement-breakpoint
-- The referral credit: once per customer per garage.
CREATE UNIQUE INDEX IF NOT EXISTS "garage_recommendations_credit_key"
  ON "garage_recommendations" ("user_id", "vendor_id") WHERE "credit_status" IS NOT NULL;--> statement-breakpoint

-- ─── An accepted request's travel fee, on the checkout and the booking ──────

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "travel_fee" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_travel_fee_check";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_travel_fee_check" CHECK ("travel_fee" IN (0, 100, 200));--> statement-breakpoint
ALTER TABLE "booking_intents" ADD COLUMN IF NOT EXISTS "travel_fee" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_intents" ADD COLUMN IF NOT EXISTS "request_id" uuid;--> statement-breakpoint
ALTER TABLE "booking_intents" DROP CONSTRAINT IF EXISTS "booking_intents_travel_fee_check";--> statement-breakpoint
ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_travel_fee_check" CHECK ("travel_fee" IN (0, 100, 200));--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_intents_request_id_fk') THEN
    ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_request_id_fk"
      FOREIGN KEY ("request_id") REFERENCES "public"."booking_requests"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_intents_request_id_idx" ON "booking_intents" ("request_id") WHERE "request_id" IS NOT NULL;--> statement-breakpoint

-- ─── discounts: a zone's free wash ──────────────────────────────────────────

ALTER TABLE "discounts" DROP CONSTRAINT IF EXISTS "discounts_source_check";--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_source_check"
  CHECK ("source" IN ('admin', 'reward', 'coupon', 'free_wash'));--> statement-breakpoint
ALTER TABLE "discounts" DROP CONSTRAINT IF EXISTS "discounts_free_wash_shape_check";--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_free_wash_shape_check" CHECK (
  "source" <> 'free_wash'
  OR (
    "funded_by" = 'platform'
    AND "vendor_id" IS NULL
    AND NOT "show_on_home"
    AND "discount_type" = 'fixed'
    AND "total_usage_limit" = 1
    AND "per_user_limit" = 1
    AND "ends_at" IS NOT NULL
    AND "service_category" = 'car_wash'
  )
);--> statement-breakpoint
ALTER TABLE "discounts" DROP CONSTRAINT IF EXISTS "discounts_service_category_check";--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_service_category_check"
  CHECK ("service_category" IS NULL OR "source" IN ('coupon', 'free_wash'));--> statement-breakpoint

-- ─── gift_credit_entries: the referral credit ───────────────────────────────

ALTER TABLE "gift_credit_entries" DROP CONSTRAINT IF EXISTS "gift_credit_entries_kind_check";--> statement-breakpoint
ALTER TABLE "gift_credit_entries" ADD CONSTRAINT "gift_credit_entries_kind_check"
  CHECK ("kind" IN ('redeem', 'debit', 'refund', 'expiry', 'adjustment', 'report_reward', 'referral_reward'));--> statement-breakpoint
ALTER TABLE "gift_credit_entries" DROP CONSTRAINT IF EXISTS "gift_credit_entries_sign_check";--> statement-breakpoint
ALTER TABLE "gift_credit_entries" ADD CONSTRAINT "gift_credit_entries_sign_check" CHECK (
  ("kind" IN ('redeem', 'refund', 'report_reward', 'referral_reward') AND "amount" > 0)
  OR ("kind" IN ('debit', 'expiry') AND "amount" < 0)
  OR "kind" = 'adjustment'
);
