CREATE TYPE "public"."vendor_pickup" AS ENUM('yes', 'nearby', 'no');--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "whatsapp" varchar(20);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "years_in_operation" varchar(20);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "maps_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pickup" "vendor_pickup";--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "pickup_radius_km" real;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "bays" integer;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "jobs_per_day" integer;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "vehicle_types" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "notes" text;