-- Garage add-ons: small extras a garage sells with its services (helmet wash,
-- oil change). An add-on is a flagged `services` row, so booking lines, money
-- and receipts keep working, and every read that means "a service" filters it
-- out. The flag is copied onto the line tables so an old booking keeps saying
-- what it sold, whatever later happens to the row.
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "is_addon" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_items" ADD COLUMN IF NOT EXISTS "is_addon" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_intent_items" ADD COLUMN IF NOT EXISTS "is_addon" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Commission and coupons lean on the category, so an add-on holds "others",
-- never shown. It is priced flat or per vehicle, never on inspection.
ALTER TABLE "services" ADD CONSTRAINT "services_addon_shape_check"
  CHECK (NOT "is_addon" OR ("category" = 'others' AND "pricing_type" <> 'on_inspection'));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "services_vendor_addon_idx" ON "services" ("vendor_id") WHERE "is_addon";
