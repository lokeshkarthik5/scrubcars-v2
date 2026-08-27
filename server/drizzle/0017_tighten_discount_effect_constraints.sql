-- Tighten the discount effect constraints so a row cannot carry the *other*
-- effect's columns.
--
-- 0016 asserted only that the required column for each type was present:
--   percentage ⟹ percent_off valid
--   fixed      ⟹ amount_off valid
-- That leaves a gap. A PATCH of { percentOff: 20 } onto a flat discount passes
-- Zod (the effect refinement can only see the payload, and the payload has no
-- discountType), passes both checks above, and writes a percent_off that
-- computeDiscount() silently ignores because it switches on discount_type.
-- The row then lies to every future reader.
--
-- The service layer now reconciles the effective type against the stored row
-- and rejects the mismatch, but the storage layer should make it impossible
-- rather than merely unlikely.

-- Clean first: the constraints below are validated against existing rows, so
-- any row that already drifted has to be reconciled before they can be added.
-- The type column is the source of truth — it is what the engine prices from —
-- so the opposite effect's columns are dropped, never the type.
UPDATE "discounts"
   SET "amount_off" = NULL
 WHERE "discount_type" = 'percentage'
   AND "amount_off" IS NOT NULL;--> statement-breakpoint

UPDATE "discounts"
   SET "percent_off" = NULL,
       "max_discount_amount" = NULL
 WHERE "discount_type" = 'fixed'
   AND ("percent_off" IS NOT NULL OR "max_discount_amount" IS NOT NULL);--> statement-breakpoint

-- DROP IF EXISTS so this is safe whether the database carries 0016's original
-- constraints or already has the tightened ones.
ALTER TABLE "discounts"
  DROP CONSTRAINT IF EXISTS "discounts_percentage_effect_check";--> statement-breakpoint

ALTER TABLE "discounts"
  ADD CONSTRAINT "discounts_percentage_effect_check" CHECK (
    "discount_type" <> 'percentage'
    OR (
      "percent_off" IS NOT NULL AND "percent_off" > 0 AND "percent_off" <= 99
      AND "amount_off" IS NULL
    )
  );--> statement-breakpoint

ALTER TABLE "discounts"
  DROP CONSTRAINT IF EXISTS "discounts_fixed_effect_check";--> statement-breakpoint

ALTER TABLE "discounts"
  ADD CONSTRAINT "discounts_fixed_effect_check" CHECK (
    "discount_type" <> 'fixed'
    OR (
      "amount_off" IS NOT NULL AND "amount_off" > 0
      AND "percent_off" IS NULL
      AND "max_discount_amount" IS NULL
    )
  );
