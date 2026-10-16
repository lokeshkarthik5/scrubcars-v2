-- The garage Bin: moving a garage to the Bin, restoring it, and deleting it
-- forever from there.
--
-- Owner decisions (16 Oct 2026) that shape this:
--
--   1. Archive and the Bin are different things. Archive stays as it is:
--      hidden from customers, everything kept, the team still signs in. The
--      Bin is for garages being deleted: off the app for customers and for
--      the garage's own team, until someone restores it or deletes it
--      forever. Nothing in the Bin is deleted on its own.
--   2. A garage can go to the Bin with bookings still to come; they are
--      cancelled by Detlio on the way in, and paid ones become refunds owed,
--      exactly as an admin cancellation makes them today.
--   3. Delete forever removes the garage and its bookings, except real money:
--      a booking chain or checkout with live, cash or unconfirmed money is
--      kept for the accounts. When something is kept the garage row stays as
--      a tombstone (`purged_at`), with its name and address for the receipts
--      and nothing else.
--
-- A separate column rather than another `status`: status, verification and
-- pause are left exactly as they were, so Restore brings back the garage it
-- found. "In the Bin" is `deleted_at IS NOT NULL`, everywhere.
--
-- Purely additive: nullable columns, a CHECK every existing row passes (all
-- four are null), and a partial index. Today's API never reads any of it, so
-- it is safe to apply before the code that uses it is deployed. No data step:
-- archived garages stay archived.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

-- When the garage went to the Bin. Null is a garage on the app.
ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint

-- The name the person typed when they moved it, like booking_notes.author:
-- the shared admin login cannot say who it was. The full record, with the
-- session, is the admin_audit_log row written in the same transaction.
ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "deleted_by_name" varchar(100);--> statement-breakpoint

-- Why, if they said. Optional, like the pause reason.
ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "deleted_reason" varchar(200);--> statement-breakpoint

-- When it was deleted forever, on a garage kept as a tombstone because real
-- money on it is kept. A garage with nothing kept is deleted outright and
-- never has this set.
ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "purged_at" timestamp with time zone;--> statement-breakpoint

-- Only a garage in the Bin can be deleted forever.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendors_purged_in_bin_check'
  ) THEN
    ALTER TABLE "vendors"
      ADD CONSTRAINT "vendors_purged_in_bin_check"
      CHECK ("purged_at" IS NULL OR "deleted_at" IS NOT NULL);
  END IF;
END
$$;--> statement-breakpoint

-- The admin list's Bin, and every "not in the Bin" read. Few rows ever have
-- it, so the index is partial.
CREATE INDEX IF NOT EXISTS "vendors_deleted_at_idx"
  ON "vendors" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;
