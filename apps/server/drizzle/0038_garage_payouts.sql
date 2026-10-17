-- Garage earnings and payouts.
--
-- Customers pay Detlio through Razorpay; Detlio pays each garage its share
-- by bank transfer or UPI, by hand, within 24 hours of the job (the cycle
-- agreed with the garages). Until now nothing recorded those transfers, so
-- neither side could see what had been paid. Three tables:
--
--   - `vendor_payouts`: one row per transfer Detlio made to a garage: the
--     amount, how (bank / UPI / other), the bank's reference (UTR) or UPI
--     transaction id, when it was paid, who in the team recorded it (the
--     typed name, plus the session that did it) and the bookings it covers
--     (`covers_from` to `covers_up_to`: everything that became payable up to
--     the moment the admin pressed Record payout).
--   - `vendor_payout_items`: what each payout paid, booking by booking. One
--     row per reschedule chain (keyed, like receipt numbers, by the chain's
--     first booking) per payout, with the figures it was paid on: price,
--     Detlio's promo, the garage's promo, refunds, commission (or its place
--     in the free 25), the garage's share, cash the garage took itself, and
--     `amount`, what this payout settled for it.
--   - `vendor_payout_accounts`: where to send a garage's money (account
--     name, number and IFSC, and/or a UPI id). Admin-only; nothing the
--     garage portal or the customer app reads.
--
-- Why a per-booking row rather than computing everything each time:
-- earnings themselves are still worked out on every read, from the bookings,
-- payments, final bills and refund records and the commission rules
-- (lib/payouts.ts on top of lib/commission.ts), because those are the
-- source of truth and can change after a job (a final bill paid the next
-- day, a refund, a booking marked Test). But a payout is a fact about money
-- that left Detlio's bank, and a statement must say what it was paid on
-- even if a figure behind it moves later. So each payout keeps the figures
-- it paid, and a booking's balance is always "what it earns now, less
-- everything already paid on it": a booking can never be paid twice, a
-- refund after a payout shows as money owed back (taken off the next
-- payout), and an old statement never changes.
--
-- Foreign keys: an item names its booking ON DELETE RESTRICT and its garage
-- payout's garage is ON DELETE RESTRICT too, so paid-out money can only go
-- deliberately: the test-data reset and Delete forever (lib/data-reset.ts)
-- delete a payout only together with every booking it paid, and keep the
-- lot otherwise. The payout account goes with its garage (CASCADE), and is
-- cleared when a deleted garage is kept as a tombstone.
--
-- Purely additive: three new tables that today's API never reads, so it is
-- safe to apply before the code that uses it is deployed.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

CREATE TABLE IF NOT EXISTS "vendor_payouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  -- Text with a CHECK rather than an enum, like refund_records.source.
  "method" text NOT NULL,
  -- The UTR of a bank transfer, or the UPI transaction id: what the garage
  -- matches against its bank statement.
  "reference" varchar(80) NOT NULL,
  "paid_at" timestamp with time zone NOT NULL,
  -- The bookings it covers: from the earliest that became payable to the
  -- moment the admin recorded it.
  "covers_from" timestamp with time zone NOT NULL,
  "covers_up_to" timestamp with time zone NOT NULL,
  "note" varchar(500),
  -- The name typed in the dialog (the shared admin login is always
  -- 'admin'), and the session that recorded it.
  "recorded_by" varchar(100) NOT NULL,
  "recorded_by_sub" varchar(100) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendor_payouts_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "vendor_payouts_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "vendor_payouts_method_check" CHECK ("method" IN ('bank', 'upi', 'other')),
  CONSTRAINT "vendor_payouts_reference_check" CHECK (char_length(btrim("reference")) > 0),
  CONSTRAINT "vendor_payouts_recorded_by_check" CHECK (char_length(btrim("recorded_by")) > 0),
  CONSTRAINT "vendor_payouts_covers_check" CHECK ("covers_from" <= "covers_up_to")
);--> statement-breakpoint

-- The same reference twice for one garage is the same transfer recorded
-- twice: refused, whatever the dialog sent.
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_payouts_vendor_id_reference_key"
  ON "vendor_payouts" ("vendor_id", "reference");--> statement-breakpoint

-- A garage's payout history, newest first; and "paid this month".
CREATE INDEX IF NOT EXISTS "vendor_payouts_vendor_id_paid_at_idx"
  ON "vendor_payouts" ("vendor_id", "paid_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vendor_payout_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payout_id" uuid NOT NULL,
  -- The reschedule chain's first booking, as receipt_numbers keys a chain.
  "booking_id" uuid NOT NULL,
  -- Its 8-character reference, as printed on the statement.
  "booking_ref" varchar(8) NOT NULL,
  -- What it was paid as: a finished job, a customer no-show, or 'none' when
  -- it earned nothing any more by then (a full refund after an earlier
  -- payout: the item takes that money back).
  "kind" text NOT NULL,
  "payable_from" timestamp with time zone NOT NULL,
  -- The figures it was paid on, in rupees, as they stood at the payout.
  "price" numeric(10, 2) NOT NULL,
  "detlio_promo" numeric(10, 2) NOT NULL,
  "garage_promo" numeric(10, 2) NOT NULL,
  "refunds" numeric(10, 2) NOT NULL,
  "commission" numeric(10, 2) NOT NULL,
  -- Its place in the garage's first 25 when it was one of them (no
  -- commission), else null.
  "free_position" smallint,
  "garage_share" numeric(10, 2) NOT NULL,
  -- Money the garage collected itself (cash on an old booking).
  "held_by_garage" numeric(10, 2) NOT NULL,
  -- What this payout settled for it: its balance at the time. Negative when
  -- money paid on it before was taken back.
  "amount" numeric(10, 2) NOT NULL,
  CONSTRAINT "vendor_payout_items_payout_id_vendor_payouts_id_fk"
    FOREIGN KEY ("payout_id") REFERENCES "public"."vendor_payouts"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "vendor_payout_items_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "vendor_payout_items_kind_check" CHECK ("kind" IN ('job', 'customer_no_show', 'none')),
  CONSTRAINT "vendor_payout_items_amount_check" CHECK ("amount" <> 0),
  CONSTRAINT "vendor_payout_items_free_position_check" CHECK (
    "free_position" IS NULL OR "free_position" > 0
  ),
  -- A booking once per payout.
  CONSTRAINT "vendor_payout_items_payout_id_booking_id_key" UNIQUE ("payout_id", "booking_id")
);--> statement-breakpoint

-- What has been paid on a booking so far, and the foreign key's own check
-- when the reset or Delete forever removes a booking.
CREATE INDEX IF NOT EXISTS "vendor_payout_items_booking_id_idx"
  ON "vendor_payout_items" ("booking_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vendor_payout_accounts" (
  "vendor_id" uuid PRIMARY KEY NOT NULL,
  "account_name" varchar(100),
  "account_number" varchar(18),
  "ifsc" varchar(11),
  "upi_id" varchar(100),
  "updated_by" varchar(100) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendor_payout_accounts_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  -- Indian bank account numbers are 9 to 18 digits.
  CONSTRAINT "vendor_payout_accounts_account_number_check" CHECK (
    "account_number" IS NULL OR "account_number" ~ '^[0-9]{9,18}$'
  ),
  -- Four letters, a zero, then six letters or digits.
  CONSTRAINT "vendor_payout_accounts_ifsc_check" CHECK (
    "ifsc" IS NULL OR "ifsc" ~ '^[A-Z]{4}0[A-Z0-9]{6}$'
  ),
  CONSTRAINT "vendor_payout_accounts_upi_id_check" CHECK (
    "upi_id" IS NULL OR "upi_id" ~ '^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9.-]+$'
  ),
  -- A bank account is its number and IFSC together, or neither.
  CONSTRAINT "vendor_payout_accounts_bank_check" CHECK (
    ("account_number" IS NULL) = ("ifsc" IS NULL)
  ),
  -- Something to pay to.
  CONSTRAINT "vendor_payout_accounts_some_check" CHECK (
    "account_number" IS NOT NULL OR "upi_id" IS NOT NULL
  )
);
