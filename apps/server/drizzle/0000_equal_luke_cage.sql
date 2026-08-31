DO $$ BEGIN
  CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."booking_type" AS ENUM('doorstep', 'dropin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."otp_purpose" AS ENUM('login', 'register', 'vendor_onboard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."payment_gateway" AS ENUM('razorpay');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."payment_method" AS ENUM('online', 'cash');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'failed', 'refunded', 'collected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."service_category" AS ENUM('car_wash', 'detailing', 'coating', 'scratch_removal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."vehicle_type" AS ENUM('sedan', 'suv', 'hatchback');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."vendor_status" AS ENUM('pending', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"booking_type" "booking_type" NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"lat" real,
	"lng" real,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "otp_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(20) NOT NULL,
	"otp_code" varchar(10) NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"gateway" "payment_gateway" NOT NULL,
	"gateway_txn_id" varchar(255),
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" "service_category" NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"duration_mins" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" varchar(100) NOT NULL,
	"address" text NOT NULL,
	"city" varchar(100) NOT NULL,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"make" varchar(100) NOT NULL,
	"model" varchar(100) NOT NULL,
	"color" varchar(50),
	"license_plate" varchar(20),
	"vehicle_type" "vehicle_type" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(255),
	"phone_verified" boolean DEFAULT false NOT NULL,
	"is_customer" boolean DEFAULT true NOT NULL,
	"is_vendor_owner" boolean DEFAULT false NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"url" varchar(2048) NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_service_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"area_name" varchar(255) NOT NULL,
	"pincode" varchar(10) NOT NULL,
	"radius_km" real
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_working_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"open_time" time NOT NULL,
	"close_time" time NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"business_name" varchar(255) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"address" text NOT NULL,
	"city" varchar(100) NOT NULL,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"doorstep_enabled" boolean DEFAULT false NOT NULL,
	"dropin_enabled" boolean DEFAULT false NOT NULL,
	"slot_interval_mins" integer DEFAULT 30 NOT NULL,
	"status" "vendor_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Ensure all columns exist on pre-existing tables (idempotent backfill)
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "booking_type" "booking_type" NOT NULL DEFAULT 'doorstep';
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp with time zone NOT NULL DEFAULT now();
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "status" "booking_status" NOT NULL DEFAULT 'pending';
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "amount" numeric(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_method" "payment_method" NOT NULL DEFAULT 'online';
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "lat" real;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "lng" real;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "address" text;
--> statement-breakpoint
ALTER TABLE "otp_verifications" ADD COLUMN IF NOT EXISTS "verified" boolean NOT NULL DEFAULT false;
ALTER TABLE "otp_verifications" ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0;
ALTER TABLE "otp_verifications" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "gateway" "payment_gateway" NOT NULL DEFAULT 'razorpay';
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "gateway_txn_id" varchar(255);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "currency" varchar(3) NOT NULL DEFAULT 'INR';
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "status" "payment_status" NOT NULL DEFAULT 'pending';
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "token_hash" varchar(64) NOT NULL DEFAULT '';
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "revoked" boolean NOT NULL DEFAULT false;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "rating" integer NOT NULL DEFAULT 0;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "comment" text;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "category" "service_category" NOT NULL DEFAULT 'car_wash';
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "price" numeric(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "duration_mins" integer NOT NULL DEFAULT 30;
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "user_addresses" ADD COLUMN IF NOT EXISTS "label" varchar(100) NOT NULL DEFAULT '';
ALTER TABLE "user_addresses" ADD COLUMN IF NOT EXISTS "address" text NOT NULL DEFAULT '';
ALTER TABLE "user_addresses" ADD COLUMN IF NOT EXISTS "city" varchar(100) NOT NULL DEFAULT '';
ALTER TABLE "user_addresses" ADD COLUMN IF NOT EXISTS "lat" real NOT NULL DEFAULT 0;
ALTER TABLE "user_addresses" ADD COLUMN IF NOT EXISTS "lng" real NOT NULL DEFAULT 0;
ALTER TABLE "user_addresses" ADD COLUMN IF NOT EXISTS "is_default" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "user_vehicles" ADD COLUMN IF NOT EXISTS "make" varchar(100) NOT NULL DEFAULT '';
ALTER TABLE "user_vehicles" ADD COLUMN IF NOT EXISTS "model" varchar(100) NOT NULL DEFAULT '';
ALTER TABLE "user_vehicles" ADD COLUMN IF NOT EXISTS "color" varchar(50);
ALTER TABLE "user_vehicles" ADD COLUMN IF NOT EXISTS "license_plate" varchar(20);
ALTER TABLE "user_vehicles" ADD COLUMN IF NOT EXISTS "vehicle_type" "vehicle_type" NOT NULL DEFAULT 'sedan';
ALTER TABLE "user_vehicles" ADD COLUMN IF NOT EXISTS "is_default" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" varchar(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_verified" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_customer" boolean NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_vendor_owner" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_admin" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" "user_status" NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE "vendor_photos" ADD COLUMN IF NOT EXISTS "url" varchar(2048) NOT NULL DEFAULT '';
ALTER TABLE "vendor_photos" ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "vendor_service_areas" ADD COLUMN IF NOT EXISTS "area_name" varchar(255) NOT NULL DEFAULT '';
ALTER TABLE "vendor_service_areas" ADD COLUMN IF NOT EXISTS "pincode" varchar(10) NOT NULL DEFAULT '';
ALTER TABLE "vendor_service_areas" ADD COLUMN IF NOT EXISTS "radius_km" real;
--> statement-breakpoint
ALTER TABLE "vendor_working_hours" ADD COLUMN IF NOT EXISTS "day_of_week" integer NOT NULL DEFAULT 0;
ALTER TABLE "vendor_working_hours" ADD COLUMN IF NOT EXISTS "open_time" time NOT NULL DEFAULT '09:00';
ALTER TABLE "vendor_working_hours" ADD COLUMN IF NOT EXISTS "close_time" time NOT NULL DEFAULT '18:00';
ALTER TABLE "vendor_working_hours" ADD COLUMN IF NOT EXISTS "is_closed" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "business_name" varchar(255) NOT NULL DEFAULT '';
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "phone" varchar(20) NOT NULL DEFAULT '';
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "address" text NOT NULL DEFAULT '';
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "city" varchar(100) NOT NULL DEFAULT '';
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "lat" real NOT NULL DEFAULT 0;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "lng" real NOT NULL DEFAULT 0;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "is_verified" boolean NOT NULL DEFAULT false;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "doorstep_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "dropin_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "slot_interval_mins" integer NOT NULL DEFAULT 30;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "status" "vendor_status" NOT NULL DEFAULT 'pending';
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_id_user_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."user_vehicles"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "services" ADD CONSTRAINT "services_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_vehicles" ADD CONSTRAINT "user_vehicles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendor_photos" ADD CONSTRAINT "vendor_photos_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendor_service_areas" ADD CONSTRAINT "vendor_service_areas_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendor_working_hours" ADD CONSTRAINT "vendor_working_hours_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendors" ADD CONSTRAINT "vendors_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_user_id_idx" ON "bookings" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_vendor_id_idx" ON "bookings" USING btree ("vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_vendor_scheduled_at_idx" ON "bookings" USING btree ("vendor_id","scheduled_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_status_idx" ON "bookings" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "otp_verifications_phone_idx" ON "otp_verifications" USING btree ("phone");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "otp_verifications_expires_at_idx" ON "otp_verifications" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_booking_id_idx" ON "payments" USING btree ("booking_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_token_hash_idx" ON "refresh_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_expires_at_idx" ON "refresh_tokens" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_vendor_id_idx" ON "reviews" USING btree ("vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_user_id_idx" ON "reviews" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "services_vendor_id_idx" ON "services" USING btree ("vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "services_category_idx" ON "services" USING btree ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_addresses_user_id_idx" ON "user_addresses" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_vehicles_user_id_idx" ON "user_vehicles" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_phone_idx" ON "users" USING btree ("phone");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_photos_vendor_id_idx" ON "vendor_photos" USING btree ("vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_service_areas_vendor_id_idx" ON "vendor_service_areas" USING btree ("vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_working_hours_vendor_id_idx" ON "vendor_working_hours" USING btree ("vendor_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_working_hours_vendor_day_idx" ON "vendor_working_hours" USING btree ("vendor_id","day_of_week");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendors_owner_id_idx" ON "vendors" USING btree ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendors_status_idx" ON "vendors" USING btree ("status");
