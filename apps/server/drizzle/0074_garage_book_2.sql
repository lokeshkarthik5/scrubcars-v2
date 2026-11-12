-- Garage Book, stages 2 and 3 (modules/garage-book; screens OK'd 12 Nov 2026):
-- the team and who did each job, expenses (so Profit is real), bills with the
-- garage's own running number, the garage's UPI details on its bills, its own
-- booking link, bringing in a paper book, stock that goes down by itself, and
-- the garage's own supplier orders.
--
--   garage_team_members         the garage's people: names only, no login
--   garage_job_workers          who did a job (a walk-in or a Detlio booking)
--   garage_expenses             money spent; "every month" ones copy themselves
--   garage_bill_counters        each garage's last bill number (never reused)
--   garage_bills                one bill per job, a frozen copy of what it said
--   garage_payment_details      the garage's own UPI QR, phone and apps: shown
--                               on bills, reminders and its booking page only;
--                               Detlio never handles that money
--   garage_book_links           the garage's own booking page, detlio.com/g/<slug>
--   garage_book_link_services   which services that page shows
--   garage_suppliers            the garage's own suppliers (name and WhatsApp)
--   garage_stock_items          what the garage keeps in stock, in one unit each
--   garage_stock_usage          how much of an item each service uses
--   garage_stock_moves          every change to a level: used, counted, received
--   garage_supply_orders        orders sent to a supplier on WhatsApp
--   garage_milestones_seen      milestone cards a garage has already been shown
--
-- And three new columns on 0072's tables: garage_jobs.origin (walk_in, link or
-- import), garage_customers.source_note, and garage_payments.source (an
-- opening balance brought in from a paper book, once per customer).
--
-- Purely additive: today's API never reads these, so it is safe to apply
-- before the code that uses it is deployed (the code is also behind
-- GARAGE_BOOK=on). Applied by scripts/migrate.sh, one transaction per file.
-- Every statement is safe to re-run.

-- ─── Team ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "garage_team_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "name" varchar(120) NOT NULL,
  "role" varchar(60),
  "phone" varchar(20),
  -- The one day this person is off ("Day off today"); a past date means at work.
  "off_on" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "garage_team_members_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_team_members_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "garage_team_members_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^[0-9]{10}$')
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_team_members_vendor_idx"
  ON "garage_team_members" ("vendor_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_job_workers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "garage_job_id" uuid,
  "booking_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_job_workers_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_job_workers_member_id_garage_team_members_id_fk"
    FOREIGN KEY ("member_id") REFERENCES "public"."garage_team_members"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_job_workers_garage_job_id_garage_jobs_id_fk"
    FOREIGN KEY ("garage_job_id") REFERENCES "public"."garage_jobs"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_job_workers_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  -- A walk-in or a Detlio booking, never both and never neither.
  CONSTRAINT "garage_job_workers_target_check"
    CHECK (("garage_job_id" IS NULL) <> ("booking_id" IS NULL))
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "garage_job_workers_job_member_key"
  ON "garage_job_workers" ("garage_job_id", "member_id") WHERE "garage_job_id" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "garage_job_workers_booking_member_key"
  ON "garage_job_workers" ("booking_id", "member_id") WHERE "booking_id" IS NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_job_workers_member_idx"
  ON "garage_job_workers" ("member_id");--> statement-breakpoint

-- ─── Expenses ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "garage_expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "category" text NOT NULL,
  "amount_paise" integer NOT NULL,
  "spent_on" date NOT NULL,
  "note" varchar(200),
  "method" text,
  "member_id" uuid,
  "every_month" boolean DEFAULT false NOT NULL,
  -- An "every month" expense and its copies share a series: the first one's
  -- id, and the IST month each copy is for. One copy per series per month.
  "series_id" uuid,
  "series_month" varchar(7),
  "supply_order_id" uuid,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "garage_expenses_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_expenses_member_id_garage_team_members_id_fk"
    FOREIGN KEY ("member_id") REFERENCES "public"."garage_team_members"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_expenses_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_expenses_category_check"
    CHECK ("category" IN ('salary', 'advance', 'rent', 'supplies', 'power_water', 'other')),
  CONSTRAINT "garage_expenses_amount_check" CHECK ("amount_paise" > 0),
  CONSTRAINT "garage_expenses_method_check" CHECK ("method" IS NULL OR "method" IN ('cash', 'upi', 'bank')),
  CONSTRAINT "garage_expenses_series_check"
    CHECK (("series_id" IS NULL) = ("series_month" IS NULL)
           AND ("series_month" IS NULL OR "series_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'))
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_expenses_vendor_spent_idx"
  ON "garage_expenses" ("vendor_id", "spent_on");--> statement-breakpoint

-- Reading a month copies each "every month" series into it once, however
-- many times the month is read at once.
CREATE UNIQUE INDEX IF NOT EXISTS "garage_expenses_series_month_key"
  ON "garage_expenses" ("series_id", "series_month") WHERE "series_id" IS NOT NULL;--> statement-breakpoint

-- One expense per received supply order: tapping Received twice adds one bill.
CREATE UNIQUE INDEX IF NOT EXISTS "garage_expenses_supply_order_key"
  ON "garage_expenses" ("supply_order_id") WHERE "supply_order_id" IS NOT NULL;--> statement-breakpoint

-- ─── Bills ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "garage_bill_counters" (
  "vendor_id" uuid PRIMARY KEY NOT NULL,
  "last_number" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "garage_bill_counters_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_bill_counters_last_number_check" CHECK ("last_number" >= 0)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_bills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "number" integer NOT NULL,
  "garage_job_id" uuid,
  "booking_id" uuid,
  "token" varchar(64) NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_bills_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_bills_garage_job_id_garage_jobs_id_fk"
    FOREIGN KEY ("garage_job_id") REFERENCES "public"."garage_jobs"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_bills_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_bills_number_check" CHECK ("number" > 0),
  CONSTRAINT "garage_bills_token_check" CHECK ("token" ~ '^[A-Za-z0-9_-]{22,64}$'),
  CONSTRAINT "garage_bills_target_check"
    CHECK (("garage_job_id" IS NULL) <> ("booking_id" IS NULL))
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "garage_bills_vendor_number_key"
  ON "garage_bills" ("vendor_id", "number");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "garage_bills_token_key"
  ON "garage_bills" ("token");--> statement-breakpoint

-- One bill per job: asking again returns it.
CREATE UNIQUE INDEX IF NOT EXISTS "garage_bills_job_key"
  ON "garage_bills" ("garage_job_id") WHERE "garage_job_id" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "garage_bills_booking_key"
  ON "garage_bills" ("booking_id") WHERE "booking_id" IS NOT NULL;--> statement-breakpoint

-- ─── Payment details ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "garage_payment_details" (
  "vendor_id" uuid PRIMARY KEY NOT NULL,
  -- The uploaded QR image's storage key (vendors/<id>/pay-qr/…), never a URL.
  "qr_key" varchar(1024),
  -- What the QR says (upi://pay?pa=…&pn=…); null when it couldn't be read.
  "upi_id" varchar(100),
  "upi_name" varchar(120),
  "phone" varchar(20),
  "apps" text[] DEFAULT '{}'::text[] NOT NULL,
  "show_on_bills" boolean DEFAULT true NOT NULL,
  "show_on_reminders" boolean DEFAULT true NOT NULL,
  "show_on_booking_page" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_payment_details_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_payment_details_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^[0-9]{10}$'),
  CONSTRAINT "garage_payment_details_apps_check"
    CHECK ("apps" <@ ARRAY['gpay', 'phonepe', 'paytm']::text[])
);--> statement-breakpoint

-- ─── Booking link ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "garage_book_links" (
  "vendor_id" uuid PRIMARY KEY NOT NULL,
  "slug" varchar(60) NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_book_links_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_book_links_slug_check"
    CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("slug") BETWEEN 3 AND 60)
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "garage_book_links_slug_key"
  ON "garage_book_links" ("slug");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_book_link_services" (
  "vendor_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "shown" boolean NOT NULL,
  CONSTRAINT "garage_book_link_services_vendor_id_service_id_pk" PRIMARY KEY ("vendor_id", "service_id"),
  CONSTRAINT "garage_book_link_services_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_book_link_services_service_id_services_id_fk"
    FOREIGN KEY ("service_id") REFERENCES "public"."services"("id")
    ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint

-- Where a walk-in came from: added at the garage, booked on the garage's own
-- link ("From your link" on Today), or brought in from a paper book.
ALTER TABLE "garage_jobs"
  ADD COLUMN IF NOT EXISTS "origin" text DEFAULT 'walk_in' NOT NULL;--> statement-breakpoint
ALTER TABLE "garage_jobs"
  DROP CONSTRAINT IF EXISTS "garage_jobs_origin_check";--> statement-breakpoint
ALTER TABLE "garage_jobs"
  ADD CONSTRAINT "garage_jobs_origin_check" CHECK ("origin" IN ('walk_in', 'link', 'import'));--> statement-breakpoint

-- ─── Bringing in a paper book ────────────────────────────────────────────────

ALTER TABLE "garage_customers"
  ADD COLUMN IF NOT EXISTS "source_note" varchar(120);--> statement-breakpoint

-- An opening balance brought in from the paper book: at most one per customer,
-- so bringing the same page in twice never doubles what they owe.
ALTER TABLE "garage_payments"
  ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint
ALTER TABLE "garage_payments"
  DROP CONSTRAINT IF EXISTS "garage_payments_source_check";--> statement-breakpoint
ALTER TABLE "garage_payments"
  ADD CONSTRAINT "garage_payments_source_check"
  CHECK ("source" IS NULL OR ("source" = 'import' AND "kind" = 'owed' AND "job_id" IS NULL));--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "garage_payments_import_owed_key"
  ON "garage_payments" ("garage_customer_id") WHERE "source" = 'import';--> statement-breakpoint

-- ─── Stock and supplies (stage 3) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "garage_suppliers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "name" varchar(120) NOT NULL,
  "phone" varchar(20),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "garage_suppliers_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_suppliers_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "garage_suppliers_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^[0-9]{10}$')
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_suppliers_vendor_idx"
  ON "garage_suppliers" ("vendor_id");--> statement-breakpoint

-- Every amount (level, low mark, pack size, a service's use) is in the item's unit.
CREATE TABLE IF NOT EXISTS "garage_stock_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "name" varchar(120) NOT NULL,
  "unit" text NOT NULL,
  "level" numeric(12, 3) DEFAULT '0' NOT NULL,
  "low_at" numeric(12, 3) DEFAULT '0' NOT NULL,
  "pack_size" numeric(12, 3),
  "pack_price_paise" integer,
  "supplier_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "garage_stock_items_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_stock_items_supplier_id_garage_suppliers_id_fk"
    FOREIGN KEY ("supplier_id") REFERENCES "public"."garage_suppliers"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_stock_items_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "garage_stock_items_unit_check" CHECK ("unit" IN ('ml', 'l', 'g', 'kg', 'pcs')),
  CONSTRAINT "garage_stock_items_level_check" CHECK ("level" >= 0 AND "low_at" >= 0),
  CONSTRAINT "garage_stock_items_pack_check"
    CHECK (("pack_size" IS NULL OR "pack_size" > 0) AND ("pack_price_paise" IS NULL OR "pack_price_paise" >= 0))
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_stock_items_vendor_idx"
  ON "garage_stock_items" ("vendor_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_stock_usage" (
  "item_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "amount" numeric(12, 3) NOT NULL,
  CONSTRAINT "garage_stock_usage_item_id_service_id_pk" PRIMARY KEY ("item_id", "service_id"),
  CONSTRAINT "garage_stock_usage_item_id_garage_stock_items_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "public"."garage_stock_items"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_stock_usage_service_id_services_id_fk"
    FOREIGN KEY ("service_id") REFERENCES "public"."services"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_stock_usage_amount_check" CHECK ("amount" > 0)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_stock_usage_service_idx"
  ON "garage_stock_usage" ("service_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_supply_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "status" text DEFAULT 'sent' NOT NULL,
  -- [{ itemId, name, packs, packSize, unit, packPricePaise }], as ordered.
  "lines" jsonb NOT NULL,
  "total_paise" integer NOT NULL,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  "received_at" timestamp with time zone,
  "expense_id" uuid,
  "created_by" uuid,
  CONSTRAINT "garage_supply_orders_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_supply_orders_supplier_id_garage_suppliers_id_fk"
    FOREIGN KEY ("supplier_id") REFERENCES "public"."garage_suppliers"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_supply_orders_expense_id_garage_expenses_id_fk"
    FOREIGN KEY ("expense_id") REFERENCES "public"."garage_expenses"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_supply_orders_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_supply_orders_status_check" CHECK ("status" IN ('sent', 'received', 'cancelled')),
  CONSTRAINT "garage_supply_orders_total_check" CHECK ("total_paise" >= 0),
  CONSTRAINT "garage_supply_orders_received_check" CHECK (("status" = 'received') = ("received_at" IS NOT NULL))
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_supply_orders_vendor_sent_idx"
  ON "garage_supply_orders" ("vendor_id", "sent_at");--> statement-breakpoint

-- An expense's order, written once the order table exists (each points at the other).
ALTER TABLE "garage_expenses"
  DROP CONSTRAINT IF EXISTS "garage_expenses_supply_order_id_garage_supply_orders_id_fk";--> statement-breakpoint
ALTER TABLE "garage_expenses"
  ADD CONSTRAINT "garage_expenses_supply_order_id_garage_supply_orders_id_fk"
  FOREIGN KEY ("supply_order_id") REFERENCES "public"."garage_supply_orders"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_stock_moves" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "delta" numeric(12, 3) NOT NULL,
  "level_after" numeric(12, 3) NOT NULL,
  "garage_job_id" uuid,
  "booking_id" uuid,
  "supply_order_id" uuid,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_stock_moves_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_stock_moves_item_id_garage_stock_items_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "public"."garage_stock_items"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_stock_moves_garage_job_id_garage_jobs_id_fk"
    FOREIGN KEY ("garage_job_id") REFERENCES "public"."garage_jobs"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_stock_moves_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_stock_moves_supply_order_id_garage_supply_orders_id_fk"
    FOREIGN KEY ("supply_order_id") REFERENCES "public"."garage_supply_orders"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_stock_moves_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_stock_moves_kind_check" CHECK ("kind" IN ('used', 'counted', 'received', 'manual')),
  CONSTRAINT "garage_stock_moves_level_check" CHECK ("level_after" >= 0)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_stock_moves_item_created_idx"
  ON "garage_stock_moves" ("item_id", "created_at");--> statement-breakpoint

-- A job uses its stock once, however many times it is marked done or retried.
CREATE UNIQUE INDEX IF NOT EXISTS "garage_stock_moves_job_used_key"
  ON "garage_stock_moves" ("item_id", "garage_job_id")
  WHERE "kind" = 'used' AND "garage_job_id" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "garage_stock_moves_booking_used_key"
  ON "garage_stock_moves" ("item_id", "booking_id")
  WHERE "kind" = 'used' AND "booking_id" IS NOT NULL;--> statement-breakpoint

-- ─── Milestones ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "garage_milestones_seen" (
  "vendor_id" uuid NOT NULL,
  "key" varchar(60) NOT NULL,
  "seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_milestones_seen_vendor_id_key_pk" PRIMARY KEY ("vendor_id", "key"),
  CONSTRAINT "garage_milestones_seen_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action
);
