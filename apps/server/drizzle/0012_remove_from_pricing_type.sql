-- Online-only pricing: the 'from' (starting price) pricing type is removed.
-- Any existing 'from' services keep their stored starting price, now as a firm
-- 'flat' price (chargeable online via Razorpay).
UPDATE "services" SET "pricing_type" = 'flat' WHERE "pricing_type" = 'from';--> statement-breakpoint

-- Postgres can't drop an enum value in place, so recreate the type without it.
ALTER TYPE "public"."service_pricing_type" RENAME TO "service_pricing_type_old";--> statement-breakpoint
CREATE TYPE "public"."service_pricing_type" AS ENUM('flat', 'per_vehicle', 'on_inspection');--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "pricing_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "pricing_type" TYPE "public"."service_pricing_type" USING "pricing_type"::text::"public"."service_pricing_type";--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "pricing_type" SET DEFAULT 'flat';--> statement-breakpoint
DROP TYPE "public"."service_pricing_type_old";
