-- Gift a wash: Detlio gifts, the Detlio credit they become, and paying for a
-- booking with that credit.
--
-- Behind GIFTS_ENABLED (default off) until the owner's lawyer/CA confirms the
-- structure (prepaid instrument rules; apps/users/lib/legal/gifts.ts). Rules in
-- lib/gift-credit.ts.
--
-- NUMBERING: runs after 0045–0048 (photo standards, car history, slot
-- alerts, Detlio Certified), which were built in parallel; nothing here
-- depends on those four files, and they do not touch these tables.
--
-- Changes:
--
--   - `gift_number_seq` and `gifts`: one row per gift bought, `pending` while
--     its Razorpay order is open, `paid`, `redeemed` once, or `cancelled` by
--     the team. Only the code's SHA-256 is stored. Buyer and redeemer are
--     RESTRICT: a gift is a money record.
--   - `gift_credit_entries`: the credit ledger. Lots (positive, with an
--     expiry: a redeemed gift, credit given back, a team adjustment) and
--     draws (negative, naming their lot: a booking, a negative adjustment, an
--     expiry). A gift is redeemed once and a booking's credit comes back once
--     (partial unique indexes). `booking_id` is SET NULL; `user_id` RESTRICT.
--   - `gift_code_attempts`: wrong codes tried, for the rate limit (hashed
--     network address, never the address). Cascades with the user.
--   - `payments.credit_amount` / `credit_returned_at`: the part of a booking
--     paid with credit, and when it went back to the customer's credit.
--     `payments.amount` stays what came through Razorpay, so every existing
--     refund rule only ever sends back money Razorpay holds.
--   - `booking_intents.credit_amount`: the credit a checkout was priced with
--     (spent only when the booking is written).
--
-- Purely additive: three new tables, a sequence, and three new columns with
-- constant defaults (or nullable) that today's API never reads, so it is safe
-- to apply before the code that uses it is deployed. Adding a NOT NULL column
-- with a constant default does not rewrite the table (PostgreSQL 11+).
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

CREATE SEQUENCE IF NOT EXISTS "gift_number_seq" AS integer START WITH 1;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "gifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "number" integer DEFAULT nextval('gift_number_seq') NOT NULL,
  "buyer_id" uuid NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "recipient_name" varchar(60) NOT NULL,
  "message" varchar(200),
  "design" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "code_hash" varchar(64),
  "links_issued" integer DEFAULT 0 NOT NULL,
  "gateway_order_id" varchar(255),
  "gateway_payment_id" varchar(255),
  "gateway_mode" text,
  "paid_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "redeemed_by" uuid,
  "redeemed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "cancelled_by" varchar(100),
  "cancel_reason" varchar(300),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "gifts_buyer_id_users_id_fk"
    FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "gifts_redeemed_by_users_id_fk"
    FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "gifts_status_check" CHECK ("status" IN ('pending', 'paid', 'redeemed', 'cancelled')),
  CONSTRAINT "gifts_design_check" CHECK ("design" IN ('shine', 'midnight', 'fresh')),
  CONSTRAINT "gifts_amount_check" CHECK ("amount" >= 300 AND "amount" <= 5000),
  CONSTRAINT "gifts_gateway_mode_check" CHECK ("gateway_mode" IN ('live', 'test', 'fake')),
  CONSTRAINT "gifts_links_issued_check" CHECK ("links_issued" >= 0),
  -- Paid, redeemed and (once paid) cancelled gifts carry the payment and the
  -- expiry; a gift is only ever redeemed after it was paid for.
  CONSTRAINT "gifts_paid_check" CHECK (
    "status" IN ('pending', 'cancelled')
    OR ("paid_at" IS NOT NULL AND "expires_at" IS NOT NULL AND "gateway_payment_id" IS NOT NULL)
  ),
  CONSTRAINT "gifts_redeemed_check" CHECK (
    ("status" = 'redeemed') = ("redeemed_by" IS NOT NULL AND "redeemed_at" IS NOT NULL)
  ),
  CONSTRAINT "gifts_cancelled_check" CHECK (
    ("status" = 'cancelled') = ("cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL)
  ),
  -- A link exists only for a gift that was paid for.
  CONSTRAINT "gifts_code_check" CHECK ("code_hash" IS NULL OR "paid_at" IS NOT NULL)
);--> statement-breakpoint

-- Dropping the table drops its number with it.
ALTER SEQUENCE "gift_number_seq" OWNED BY "gifts"."number";--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "gifts_number_key" ON "gifts" ("number");--> statement-breakpoint
-- How a code is found: by its hash. Unique, so two gifts can never share one.
CREATE UNIQUE INDEX IF NOT EXISTS "gifts_code_hash_key" ON "gifts" ("code_hash");--> statement-breakpoint
-- How the webhook finds a gift whose payment arrived without the order's notes.
CREATE UNIQUE INDEX IF NOT EXISTS "gifts_gateway_order_id_key" ON "gifts" ("gateway_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gifts_gateway_payment_id_key" ON "gifts" ("gateway_payment_id");--> statement-breakpoint
-- A buyer's gifts, newest first, and today's total for the daily limit.
CREATE INDEX IF NOT EXISTS "gifts_buyer_id_created_at_idx" ON "gifts" ("buyer_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gifts_redeemed_by_idx" ON "gifts" ("redeemed_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gifts_status_idx" ON "gifts" ("status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "gift_credit_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "lot_id" uuid,
  "expires_at" timestamp with time zone,
  "gift_id" uuid,
  "booking_id" uuid,
  "reason" varchar(300),
  "actor_name" varchar(100),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "gift_credit_entries_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "gift_credit_entries_lot_id_fk"
    FOREIGN KEY ("lot_id") REFERENCES "public"."gift_credit_entries"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "gift_credit_entries_gift_id_gifts_id_fk"
    FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "gift_credit_entries_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "gift_credit_entries_kind_check"
    CHECK ("kind" IN ('redeem', 'debit', 'refund', 'expiry', 'adjustment')),
  CONSTRAINT "gift_credit_entries_amount_check" CHECK ("amount" <> 0),
  -- A lot is positive with an expiry and no lot of its own; a draw is
  -- negative and names its lot.
  CONSTRAINT "gift_credit_entries_lot_check" CHECK (
    ("amount" > 0) = ("lot_id" IS NULL) AND ("amount" > 0) = ("expires_at" IS NOT NULL)
  ),
  CONSTRAINT "gift_credit_entries_sign_check" CHECK (
    ("kind" IN ('redeem', 'refund') AND "amount" > 0)
    OR ("kind" IN ('debit', 'expiry') AND "amount" < 0)
    OR "kind" = 'adjustment'
  ),
  -- A redeemed gift names its gift; a team adjustment says why and who.
  CONSTRAINT "gift_credit_entries_gift_check" CHECK (("kind" = 'redeem') = ("gift_id" IS NOT NULL)),
  CONSTRAINT "gift_credit_entries_adjustment_check" CHECK (
    "kind" <> 'adjustment' OR ("reason" IS NOT NULL AND "actor_name" IS NOT NULL)
  )
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "gift_credit_entries_user_id_idx"
  ON "gift_credit_entries" ("user_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gift_credit_entries_lot_id_idx"
  ON "gift_credit_entries" ("lot_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gift_credit_entries_booking_id_idx"
  ON "gift_credit_entries" ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gift_credit_entries_redeem_gift_key"
  ON "gift_credit_entries" ("gift_id")
  WHERE "kind" = 'redeem';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gift_credit_entries_refund_booking_key"
  ON "gift_credit_entries" ("booking_id")
  WHERE "kind" = 'refund';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "gift_code_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "ip_key" varchar(32) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "gift_code_attempts_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "gift_code_attempts_user_id_idx"
  ON "gift_code_attempts" ("user_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gift_code_attempts_ip_key_idx"
  ON "gift_code_attempts" ("ip_key", "created_at");--> statement-breakpoint

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "credit_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "credit_returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_intents" ADD COLUMN IF NOT EXISTS "credit_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_credit_amount_check') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_credit_amount_check" CHECK ("credit_amount" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_credit_returned_check') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_credit_returned_check"
      CHECK ("credit_returned_at" IS NULL OR "credit_amount" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_intents_credit_amount_check') THEN
    ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_credit_amount_check"
      CHECK ("credit_amount" >= 0);
  END IF;
END
$$;--> statement-breakpoint

-- The pending-digest cron's sweep: booking credit still to give back.
CREATE INDEX IF NOT EXISTS "payments_credit_unreturned_idx"
  ON "payments" ("booking_id")
  WHERE "credit_amount" > 0 AND "credit_returned_at" IS NULL;
