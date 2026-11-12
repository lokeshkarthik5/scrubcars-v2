-- On inspection with no fee, and an approx price (owner, 12 Nov 2026: "there
-- are some services for which vendors would choose price on inspection ... we
-- just want that fixed as price on inspection then later upon inspection the
-- vendor can quote price on our app and customer pays it. Also give a small
-- text where we optionally can input approx price if wanted").
--
-- No column changes for "no fee": an on-inspection service's `price` is its
-- inspection fee, and 0 now means none (the API stopped requiring a positive
-- fee for on_inspection). Such a booking is made with nothing paid, through
-- checkout's no-payment path, and the garage's final bill is the whole price.
--
-- New: `services.approx_price`, the garage's optional rough price for an
-- on-inspection job. A guide shown to customers ("Approx ₹1,500 · price after
-- inspection"), never charged and never read by any money rule. Null when
-- none, and on every flat or per-vehicle service (the API writes null for
-- those; the CHECK keeps it positive when set).
--
-- Purely additive: today's API never reads the column, so it is safe to apply
-- before the code that uses it is deployed. Applied by scripts/migrate.sh, one
-- transaction per file. Every statement is safe to re-run.

ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "approx_price" numeric(10, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'services_approx_price_check'
  ) THEN
    ALTER TABLE "services"
      ADD CONSTRAINT "services_approx_price_check"
      CHECK ("approx_price" IS NULL OR "approx_price" > 0);
  END IF;
END $$;
