-- Off-app payment flags (OFF_APP_FLAGS_ENABLED, docs/off-app-flags.md): Detlio's
-- own checks add entries to the admin Bypass reports list, "Flagged by
-- Detlio", next to customers' reports (0052). A flag has no reporter: no
-- customer, no chain to block a customer's own report of it, and never a
-- reward. Only a person's Confirm makes it a strike, as for any report.
--
--   source        'customer' (every row until now) or 'detlio'
--   signal        what Detlio's check found (a flag only):
--                   contact_in_note            a phone number, UPI ID or "pay
--                                              directly" in a garage's note the
--                                              customer sees
--                   regulars_went_quiet        several repeat customers stopped
--                                              booking the garage
--                   cancelled_after_inspection the same customer and garage
--                                              cancelling after inspection, again
--   evidence      what was found (a flag only): masked excerpts, counts and the
--                 bookings, never a full phone number
--   evidence_key  one flag per piece of evidence (unique): the daily check can
--                 run any number of times without making a second one
--
-- booking_ref may now be empty, for a flag about a garage rather than one
-- booking (regulars went quiet); a customer's report still always has one
-- (CHECK). Never read from Garage Book (garage_*), by the owner's rule.
--
-- Purely additive for today's API: it never writes 'detlio' rows, and every
-- existing row reads 'customer'. Applied by scripts/migrate.sh, one
-- transaction per file. Every statement is safe to re-run.

ALTER TABLE "bypass_reports" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'customer' NOT NULL;
ALTER TABLE "bypass_reports" ADD COLUMN IF NOT EXISTS "signal" text;
ALTER TABLE "bypass_reports" ADD COLUMN IF NOT EXISTS "evidence" jsonb;
ALTER TABLE "bypass_reports" ADD COLUMN IF NOT EXISTS "evidence_key" varchar(200);
ALTER TABLE "bypass_reports" ALTER COLUMN "booking_ref" DROP NOT NULL;

ALTER TABLE "bypass_reports" DROP CONSTRAINT IF EXISTS "bypass_reports_source_check";
ALTER TABLE "bypass_reports" ADD CONSTRAINT "bypass_reports_source_check"
  CHECK ("source" in ('customer', 'detlio'));

-- A customer's report: as before, with its booking reference and none of a
-- flag's fields. A flag: its signal, evidence and key, and no reporter, no
-- chain (so the customer can still report that booking) and no reward.
ALTER TABLE "bypass_reports" DROP CONSTRAINT IF EXISTS "bypass_reports_flag_check";
ALTER TABLE "bypass_reports" ADD CONSTRAINT "bypass_reports_flag_check" CHECK (
  ("source" = 'customer'
    and "signal" is null and "evidence" is null and "evidence_key" is null
    and "booking_ref" is not null)
  or ("source" = 'detlio'
    and "signal" in ('contact_in_note', 'regulars_went_quiet', 'cancelled_after_inspection')
    and "evidence" is not null and "evidence_key" is not null
    and "user_id" is null and "root_booking_id" is null and "reward_status" = 'none')
);

CREATE UNIQUE INDEX IF NOT EXISTS "bypass_reports_evidence_key"
  ON "bypass_reports" ("evidence_key") WHERE "evidence_key" is not null;
CREATE INDEX IF NOT EXISTS "bypass_reports_source_status_idx"
  ON "bypass_reports" ("source", "status", "created_at");
