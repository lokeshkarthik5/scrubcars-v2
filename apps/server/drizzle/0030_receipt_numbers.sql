-- Consecutive receipt numbers, per financial year: DTL/26-27/000123.
--
-- Receipts were numbered DTL-<IST yymmdd>-<booking reference>: unique, but not
-- consecutive, and 19 characters. The Consumer Protection (General) Rules,
-- 2020 (rule 5(1)(b)) ask for a consecutive serial number of at most sixteen
-- characters, unique for a financial year, and a GST invoice will need the
-- same once Detlio registers. No receipt had been given to a customer under
-- the old format, so nothing is renumbered.
--
--   - `receipt_numbers`: one number per reschedule chain, keyed by the chain's
--     first booking (a reschedule carries the same payment to a new booking).
--     Issued once, never reused or renumbered. `issued_at` is when the payment
--     first went through, and its financial year (1 April to 31 March, in IST)
--     is the number's.
--   - `receipt_counters`: the last serial issued in each financial year. The
--     app bumps it with UPDATE … RETURNING in the same transaction as the
--     payment, so a rolled-back payment gives its number back. Not a SEQUENCE:
--     a sequence never does, and the series must have no gaps.
--
-- The backfill at the end numbers every receipt that exists today, in the
-- order the payments went through.
--
-- Each file runs through `psql -f` without a wrapping transaction. Every
-- statement is safe to re-run, and does nothing on an empty database.

CREATE TABLE IF NOT EXISTS "receipt_numbers" (
  "root_booking_id" uuid PRIMARY KEY NOT NULL,
  "financial_year" text NOT NULL,
  "seq" integer NOT NULL,
  "number" text NOT NULL,
  "issued_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "receipt_numbers_root_booking_id_bookings_id_fk"
    FOREIGN KEY ("root_booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "receipt_numbers_number_unique" UNIQUE ("number"),
  CONSTRAINT "receipt_numbers_financial_year_seq_key" UNIQUE ("financial_year", "seq"),
  CONSTRAINT "receipt_numbers_seq_check" CHECK ("seq" > 0),
  -- Sixteen characters is the most the consumer rules allow.
  CONSTRAINT "receipt_numbers_number_length_check" CHECK (char_length("number") <= 16)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "receipt_counters" (
  "financial_year" text PRIMARY KEY NOT NULL,
  "last_seq" integer NOT NULL
);--> statement-breakpoint

-- Backfill: a number for every chain whose receipt is available today.
--
-- The same rule as receiptAvailability + buildReceipt in lib/receipts.ts: a
-- booking has a receipt when its payment went through (paid, collected, or
-- refunded since), unless the customer moved it (another booking was
-- rescheduled from it, or it has the old 'rescheduled' status). Its payment
-- went with the move, so the moved half has no receipt of its own. The number
-- belongs to the chain's first booking (original_booking_id, or the booking
-- itself when it was never moved).
--
-- Where this differs from the TypeScript:
--   - The app dates a receipt by the payment of the booking being viewed
--     (receiptIssuedAt: paid_at, else created_at). Here a chain could in
--     principle have more than one booking with a receipt, so it takes the
--     earliest of them. A reschedule copies paid_at onto the new booking, so
--     on rows the app wrote the two are the same moment.
--   - The financial year is worked out from that moment in Asia/Kolkata, as
--     financialYearOf does: shifting the IST date back three months puts
--     1 April on 1 January, so its calendar year is the financial year's
--     first year. 'YY' is the last two digits, so 2099 to 2100 is "99-00".
--   - Numbers count on from what a financial year already has, so a re-run
--     after the app has issued some only adds the receipts still missing. A
--     row the app writes at the same moment wins any clash (ON CONFLICT DO
--     NOTHING); a chain left out that way gets its number from the receipt
--     page the first time it is opened.
WITH receipts AS (
  SELECT coalesce(b.original_booking_id, b.id) AS root_booking_id,
         coalesce(p.paid_at, p.created_at) AS issued_at
    FROM bookings b
    JOIN payments p ON p.booking_id = b.id
   WHERE p.status IN ('paid', 'collected', 'refunded')
     AND b.status <> 'rescheduled'
     AND NOT EXISTS (
       SELECT 1 FROM bookings moved_to WHERE moved_to.rescheduled_from_id = b.id
     )
),
chains AS (
  SELECT r.root_booking_id, min(r.issued_at) AS issued_at
    FROM receipts r
    -- The chain's first booking must still exist: the number hangs off it.
    JOIN bookings root ON root.id = r.root_booking_id
   WHERE NOT EXISTS (
     SELECT 1 FROM receipt_numbers rn WHERE rn.root_booking_id = r.root_booking_id
   )
   GROUP BY r.root_booking_id
),
dated AS (
  SELECT root_booking_id,
         issued_at,
         to_char((issued_at AT TIME ZONE 'Asia/Kolkata') - interval '3 months', 'YY')
           || '-'
           || to_char((issued_at AT TIME ZONE 'Asia/Kolkata') - interval '3 months' + interval '1 year', 'YY')
           AS financial_year
    FROM chains
),
numbered AS (
  SELECT d.root_booking_id,
         d.issued_at,
         d.financial_year,
         greatest(
           coalesce((SELECT c.last_seq FROM receipt_counters c WHERE c.financial_year = d.financial_year), 0),
           coalesce((SELECT max(rn.seq) FROM receipt_numbers rn WHERE rn.financial_year = d.financial_year), 0)
         )
         + row_number() OVER (
             PARTITION BY d.financial_year
             ORDER BY d.issued_at, d.root_booking_id
           ) AS seq
    FROM dated d
)
INSERT INTO "receipt_numbers" ("root_booking_id", "financial_year", "seq", "number", "issued_at")
SELECT root_booking_id,
       financial_year,
       seq,
       'DTL/' || financial_year || '/' || lpad(seq::text, 6, '0'),
       issued_at
  FROM numbered
 -- Six digits, as formatReceiptSerial: a seventh would make 17 characters.
 WHERE seq <= 999999
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Each financial year's counter starts where its numbers end. GREATEST, so a
-- re-run never moves a counter back below what the app has issued since.
INSERT INTO "receipt_counters" ("financial_year", "last_seq")
SELECT "financial_year", max("seq")
  FROM "receipt_numbers"
 GROUP BY "financial_year"
ON CONFLICT ("financial_year") DO UPDATE
  SET "last_seq" = greatest("receipt_counters"."last_seq", EXCLUDED."last_seq");
