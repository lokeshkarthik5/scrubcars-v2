-- The admin round (owner, 28 Oct 2026; ADMIN-FIXES-BACKLOG "PR 5 · Admin",
-- part 1).
--
-- Changes:
--
--   - `services.duration_mins` may be empty. An empty duration blocks the
--     default 60 minutes in the slot calendar (lib/service-duration.ts
--     effectiveDurationMins); every booking keeps writing the effective
--     number into its own snapshot, never null. Admin flags "Duration not
--     set".
--   - `services.commission_rate`: an optional percent (0 to 50) that
--     replaces the category's rate (lib/commission.ts) in Statistics. Empty
--     is the category's rate. Reporting only: payouts keep the category
--     rates.
--   - `vendors.colour_tag` (green / amber / red / blue, or none) with
--     `colour_tag_call_on` (a "Call back" day, blue only),
--     `colour_tag_set_by` and `colour_tag_set_at`: the team's own colour for
--     a garage on the Garages list. Nothing sets it automatically.
--   - `vendor_onboarding_marks.items`: a mark's checklist, a JSON array of
--     `{ id, text, done, answer, answeredBy, answeredAt }`. Empty for every
--     existing mark; a note's "- " lines are read as items until the mark is
--     next changed (lib/mark-checklist.ts).
--   - `admin_settings`: team-wide admin settings by key ("garage_target",
--     "colour_names"), with who changed them and when.
--
-- `vendors.address` stays NOT NULL: a doorstep-only garage may now keep it
-- empty (''), which every reader already handles as text.
--
-- Additive: the code in production writes every duration and never reads
-- the new columns.
ALTER TABLE "services" ALTER COLUMN "duration_mins" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "commission_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_commission_rate_check"
  CHECK ("commission_rate" IS NULL OR ("commission_rate" >= 0 AND "commission_rate" <= 50));--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "colour_tag" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "colour_tag_call_on" date;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "colour_tag_set_by" varchar(100);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "colour_tag_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_colour_tag_check"
  CHECK ("colour_tag" IS NULL OR "colour_tag" IN ('green', 'amber', 'red', 'blue'));--> statement-breakpoint
-- A call-back day only on a Call back tag.
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_colour_tag_call_on_check"
  CHECK ("colour_tag_call_on" IS NULL OR "colour_tag" = 'blue');--> statement-breakpoint
ALTER TABLE "vendor_onboarding_marks" ADD COLUMN IF NOT EXISTS "items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_onboarding_marks" ADD CONSTRAINT "vendor_onboarding_marks_items_check"
  CHECK (jsonb_typeof("items") = 'array' AND jsonb_array_length("items") <= 30);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "updated_by_name" varchar(100) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_settings_key_check" CHECK ("key" IN ('garage_target', 'colour_names')),
  CONSTRAINT "admin_settings_value_check" CHECK (jsonb_typeof("value") = 'object')
);
