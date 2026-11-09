-- Garage Book (Stage 1): the garage's own book beside its Detlio bookings —
-- its own customers and their cars, walk-in jobs, money owed and paid back,
-- and reminders (modules/garage-book; docs in the module's files).
--
-- Eight new tables. Nothing existing changes: bookings, slots, payouts and
-- receipts are untouched, and walk-ins never hold Detlio slot capacity
-- (lib/slots.ts does not read these tables).
--
--   garage_customers               the garage's own customers (never a Detlio customer)
--   garage_customer_cars           their cars, plate written as plates are laid out
--   garage_detlio_customer_notes   a private team note on a Detlio customer: never a phone
--   garage_jobs                    walk-ins; client_id makes an offline resend a no-op
--   garage_job_lines               a walk-in's services and prices
--   garage_payments                money owed (Pay later) and paid back: a record only
--   garage_reminder_settings       the garage's reminder message and default interval
--   garage_reminder_sends          every reminder sent (WhatsApp, or a Detlio push:
--                                  one per Detlio customer per garage per 7 days)
--
-- Purely additive: today's API never reads these tables, so it is safe to
-- apply before the code that uses it is deployed (the code is also behind
-- GARAGE_BOOK=on). Applied by scripts/migrate.sh, one transaction per file.
-- Every statement is also safe to re-run.

CREATE TABLE IF NOT EXISTS "garage_customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "name" varchar(120) NOT NULL,
  "phone" varchar(20),
  "note" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "garage_customers_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_customers_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "garage_customers_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^[0-9]{10}$')
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_customers_vendor_idx"
  ON "garage_customers" ("vendor_id");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "garage_customers_vendor_phone_key"
  ON "garage_customers" ("vendor_id", "phone")
  WHERE "phone" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_customer_cars" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "garage_customer_id" uuid NOT NULL,
  "vendor_id" uuid NOT NULL,
  "plate" varchar(20),
  "make" varchar(100),
  "model" varchar(100),
  "colour" varchar(50),
  "wash_interval_days" smallint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_customer_cars_garage_customer_id_garage_customers_id_fk"
    FOREIGN KEY ("garage_customer_id") REFERENCES "public"."garage_customers"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_customer_cars_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_customer_cars_wash_interval_check"
    CHECK ("wash_interval_days" IS NULL OR "wash_interval_days" BETWEEN 1 AND 365)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_customer_cars_customer_idx"
  ON "garage_customer_cars" ("garage_customer_id");--> statement-breakpoint

-- Plate lookup when a walk-in is typed in.
CREATE INDEX IF NOT EXISTS "garage_customer_cars_vendor_plate_idx"
  ON "garage_customer_cars" ("vendor_id", "plate");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_detlio_customer_notes" (
  "vendor_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "note" varchar(500) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_detlio_customer_notes_vendor_id_user_id_pk" PRIMARY KEY ("vendor_id", "user_id"),
  CONSTRAINT "garage_detlio_customer_notes_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_detlio_customer_notes_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "client_id" varchar(64) NOT NULL,
  "garage_customer_id" uuid NOT NULL,
  "car_id" uuid,
  "scheduled_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'booked' NOT NULL,
  "payment_method" text NOT NULL,
  "total_paise" integer DEFAULT 0 NOT NULL,
  "remind_in_days" smallint,
  "created_by" uuid,
  "done_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_jobs_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_jobs_garage_customer_id_garage_customers_id_fk"
    FOREIGN KEY ("garage_customer_id") REFERENCES "public"."garage_customers"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_jobs_car_id_garage_customer_cars_id_fk"
    FOREIGN KEY ("car_id") REFERENCES "public"."garage_customer_cars"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_jobs_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_jobs_status_check" CHECK ("status" IN ('booked', 'in_progress', 'done', 'cancelled')),
  CONSTRAINT "garage_jobs_payment_check" CHECK ("payment_method" IN ('upi', 'cash', 'later')),
  CONSTRAINT "garage_jobs_total_check" CHECK ("total_paise" >= 0),
  CONSTRAINT "garage_jobs_remind_check" CHECK ("remind_in_days" IS NULL OR "remind_in_days" BETWEEN 1 AND 365),
  CONSTRAINT "garage_jobs_done_check" CHECK (("status" = 'done') = ("done_at" IS NOT NULL)),
  CONSTRAINT "garage_jobs_client_id_check" CHECK (char_length("client_id") BETWEEN 8 AND 64)
);--> statement-breakpoint

-- A phone resending a walk-in it saved offline finds the first one.
CREATE UNIQUE INDEX IF NOT EXISTS "garage_jobs_vendor_client_key"
  ON "garage_jobs" ("vendor_id", "client_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_jobs_vendor_scheduled_idx"
  ON "garage_jobs" ("vendor_id", "scheduled_at");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_jobs_customer_idx"
  ON "garage_jobs" ("garage_customer_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_job_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "service_id" uuid,
  "label" varchar(120) NOT NULL,
  "price_paise" integer NOT NULL,
  "qty" smallint DEFAULT 1 NOT NULL,
  CONSTRAINT "garage_job_lines_job_id_garage_jobs_id_fk"
    FOREIGN KEY ("job_id") REFERENCES "public"."garage_jobs"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_job_lines_service_id_services_id_fk"
    FOREIGN KEY ("service_id") REFERENCES "public"."services"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_job_lines_price_check" CHECK ("price_paise" >= 0),
  CONSTRAINT "garage_job_lines_qty_check" CHECK ("qty" BETWEEN 1 AND 99),
  CONSTRAINT "garage_job_lines_label_check" CHECK (char_length(btrim("label")) BETWEEN 1 AND 120)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_job_lines_job_idx"
  ON "garage_job_lines" ("job_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "garage_customer_id" uuid NOT NULL,
  "job_id" uuid,
  "kind" text NOT NULL,
  "amount_paise" integer NOT NULL,
  "method" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_payments_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_payments_garage_customer_id_garage_customers_id_fk"
    FOREIGN KEY ("garage_customer_id") REFERENCES "public"."garage_customers"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_payments_job_id_garage_jobs_id_fk"
    FOREIGN KEY ("job_id") REFERENCES "public"."garage_jobs"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_payments_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_payments_kind_check" CHECK ("kind" IN ('owed', 'paid')),
  CONSTRAINT "garage_payments_amount_check" CHECK ("amount_paise" > 0),
  CONSTRAINT "garage_payments_method_check" CHECK ("method" IS NULL OR "method" IN ('upi', 'cash')),
  CONSTRAINT "garage_payments_paid_method_check" CHECK ("kind" = 'owed' OR "method" IS NOT NULL)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_payments_vendor_customer_idx"
  ON "garage_payments" ("vendor_id", "garage_customer_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_payments_vendor_created_idx"
  ON "garage_payments" ("vendor_id", "created_at");--> statement-breakpoint

-- One owed row per Pay later job: editing the job changes it.
CREATE UNIQUE INDEX IF NOT EXISTS "garage_payments_job_owed_key"
  ON "garage_payments" ("job_id") WHERE "kind" = 'owed';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_reminder_settings" (
  "vendor_id" uuid PRIMARY KEY NOT NULL,
  "message" varchar(500) NOT NULL,
  "default_interval_days" smallint DEFAULT 30 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_reminder_settings_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_reminder_sends" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "garage_customer_id" uuid,
  "user_id" uuid,
  "channel" text NOT NULL,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_by" uuid,
  CONSTRAINT "garage_reminder_sends_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_reminder_sends_garage_customer_id_garage_customers_id_fk"
    FOREIGN KEY ("garage_customer_id") REFERENCES "public"."garage_customers"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_reminder_sends_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_reminder_sends_sent_by_users_id_fk"
    FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_reminder_sends_channel_check" CHECK ("channel" IN ('whatsapp', 'detlio_push')),
  -- Exactly one target: an own customer or a Detlio customer.
  CONSTRAINT "garage_reminder_sends_target_check"
    CHECK (("garage_customer_id" IS NULL) <> ("user_id" IS NULL)),
  CONSTRAINT "garage_reminder_sends_channel_target_check"
    CHECK (("channel" = 'whatsapp') = ("garage_customer_id" IS NOT NULL))
);--> statement-breakpoint

-- The 7-day limit on Detlio pushes reads this one.
CREATE INDEX IF NOT EXISTS "garage_reminder_sends_vendor_user_idx"
  ON "garage_reminder_sends" ("vendor_id", "user_id", "sent_at");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_reminder_sends_vendor_customer_idx"
  ON "garage_reminder_sends" ("vendor_id", "garage_customer_id", "sent_at");
