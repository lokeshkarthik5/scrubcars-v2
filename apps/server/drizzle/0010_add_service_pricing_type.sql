DO $$ BEGIN
  CREATE TYPE "public"."service_pricing_type" AS ENUM('flat', 'per_vehicle', 'from', 'on_inspection');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "pricing_type" "service_pricing_type" DEFAULT 'flat' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "price_hatchback" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "price_sedan" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "price_suv" numeric(10, 2);
