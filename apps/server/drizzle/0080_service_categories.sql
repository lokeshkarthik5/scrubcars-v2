-- Service categories (owner-approved screens, 16 Nov 2026): three new kinds
-- of work for mechanical and body jobs, so they stop landing in Others.
--
--   service_category                    gains 'general_service' (periodic
--                                       service, oil change, check-ups),
--                                       'repairs' (engine, brakes, clutch, AC,
--                                       electrical, suspension) and
--                                       'dent_paint' (denting, painting,
--                                       panel work). Commission on them is
--                                       the code's (lib/commission.ts), 5%.
--   services.category_hint_dismissed_at when admin turned down the "Looks
--                                       like Repairs · Move" hint on a
--                                       service in Others ("Not this"): it is
--                                       never suggested again. Null is never
--                                       turned down.
--   reward_challenges_category_check    lets a challenge count the new
--                                       categories (the column is text).
--
-- Nothing moves: every existing service keeps its category, so no payout,
-- statistic or listing changes until someone files a service under a new
-- one.
--
-- The runner applies this file in one transaction, so the three new enum
-- values are not committed while the rest of the file runs, and Postgres
-- refuses to use them there ("unsafe use of new value"). Nothing below uses
-- them as a "service_category": the challenge CHECK compares a text column
-- with text literals. As 0002 and 0014 did, `ADD VALUE IF NOT EXISTS` alone,
-- with no BEFORE/AFTER: the order customers see is the code's
-- (packages/core/src/categories.ts), never the enum's.
--
-- Purely additive: new enum values, one nullable column and a CHECK that
-- accepts everything the old one did, so it is safe to apply before the code
-- that uses it is deployed. Every statement is safe to re-run.

ALTER TYPE "service_category" ADD VALUE IF NOT EXISTS 'general_service';--> statement-breakpoint
ALTER TYPE "service_category" ADD VALUE IF NOT EXISTS 'repairs';--> statement-breakpoint
ALTER TYPE "service_category" ADD VALUE IF NOT EXISTS 'dent_paint';--> statement-breakpoint

ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "category_hint_dismissed_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "reward_challenges" DROP CONSTRAINT IF EXISTS "reward_challenges_category_check";--> statement-breakpoint
ALTER TABLE "reward_challenges" ADD CONSTRAINT "reward_challenges_category_check" CHECK (
  "category" IS NULL OR "category" IN (
    'car_wash', 'detailing', 'coating', 'scratch_removal',
    'general_service', 'repairs', 'dent_paint', 'others', 'package'
  )
);
