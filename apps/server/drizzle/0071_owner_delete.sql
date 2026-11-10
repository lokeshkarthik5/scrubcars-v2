-- The owner can delete anything marked Test (owner, 10 Nov 2026: "As a owner
-- I basically need access to delete or remove anything & everything").
--
-- For the owner's login alone, Delete test booking (and Delete forever for a
-- garage in the Bin) now takes a booking whose money is still real: paid and
-- not refunded, a Razorpay refund still processing, cash, Detlio credit, or
-- a garage payout that covered it. Nothing is refunded by the delete; every
-- rupee is still accounted for in the hidden ledger, `deleted_test_payments`
-- (0065), which the Refunds page downloads as CSV. Before this file the
-- ledger could only hold money all refunded, so it gains:
--
--   - `state`: where the money stands. 'refunded' (every row before 0071),
--     'not_refunded', 'refund_pending', 'credit_returned' (paid with Detlio
--     credit alone, which goes back to the customer) and 'paid_out' (a garage
--     payout's line on the booking: deleting one booking leaves the payout
--     on record; the owner's Delete forever of a garage deletes its payouts
--     too, owner 10 Nov 2026, so these rows are then their only record).
--   - `note`: a line for the money record ("Paid out to Speed Wash on
--     3 Nov 2026 (UTR123)").
--   - `credit_returned`: Detlio credit spent on the payment that went back
--     to the customer's credit balance with the delete.
--   - `vendor_payout_id`: the payout a 'paid_out' row's line was on. No
--     foreign key, like the row's booking ids: the ledger outlives them, and
--     the payout may be deleted after (with its garage). A foreign key could
--     only block that delete or SET NULL, which the append-only trigger
--     refuses; the row's note keeps the payout's date and reference.
--
-- The kind gains 'payout', and the amount check is loosened to match: a
-- payment is 0 or more (credit alone is 0 through Razorpay) and only a
-- 'refunded' row must be refunded in full; a payout line is never 0 (a
-- negative one was money the garage owed back), as vendor_payout_items holds.
--
-- Each statement is safe to run twice. The table stays append-only.

ALTER TABLE "deleted_test_payments"
  ADD COLUMN IF NOT EXISTS "state" text DEFAULT 'refunded' NOT NULL;--> statement-breakpoint
ALTER TABLE "deleted_test_payments"
  ADD COLUMN IF NOT EXISTS "note" varchar(300);--> statement-breakpoint
ALTER TABLE "deleted_test_payments"
  ADD COLUMN IF NOT EXISTS "credit_returned" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "deleted_test_payments"
  ADD COLUMN IF NOT EXISTS "vendor_payout_id" uuid;--> statement-breakpoint

ALTER TABLE "deleted_test_payments"
  DROP CONSTRAINT IF EXISTS "deleted_test_payments_state_check";--> statement-breakpoint
ALTER TABLE "deleted_test_payments"
  ADD CONSTRAINT "deleted_test_payments_state_check"
  CHECK ("state" IN ('refunded', 'not_refunded', 'refund_pending', 'credit_returned', 'paid_out'));--> statement-breakpoint

ALTER TABLE "deleted_test_payments"
  DROP CONSTRAINT IF EXISTS "deleted_test_payments_kind_check";--> statement-breakpoint
ALTER TABLE "deleted_test_payments"
  ADD CONSTRAINT "deleted_test_payments_kind_check"
  CHECK ("kind" IN ('booking', 'final_bill', 'extra_work', 'payout'));--> statement-breakpoint

-- A payout line is a payout's own and nothing else's; a payment is never one.
ALTER TABLE "deleted_test_payments"
  DROP CONSTRAINT IF EXISTS "deleted_test_payments_payout_check";--> statement-breakpoint
ALTER TABLE "deleted_test_payments"
  ADD CONSTRAINT "deleted_test_payments_payout_check"
  CHECK (("kind" = 'payout') = ("state" = 'paid_out')
         AND ("kind" <> 'payout' OR "vendor_payout_id" IS NOT NULL));--> statement-breakpoint

ALTER TABLE "deleted_test_payments"
  DROP CONSTRAINT IF EXISTS "deleted_test_payments_amount_check";--> statement-breakpoint
ALTER TABLE "deleted_test_payments"
  ADD CONSTRAINT "deleted_test_payments_amount_check"
  CHECK (
    "refunded_amount" >= 0
    AND "credit_returned" >= 0
    AND CASE
      WHEN "kind" = 'payout' THEN "amount" <> 0
      ELSE "amount" >= 0
        AND ("amount" > 0 OR "credit_returned" > 0)
        AND ("state" <> 'refunded' OR "refunded_amount" >= "amount")
    END
  );
