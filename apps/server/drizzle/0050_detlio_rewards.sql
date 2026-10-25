-- Detlio Rewards: the Shine Card (stamps), scratch cards, monthly streaks,
-- levels and Invite a friend, so booking through Detlio becomes a habit.
--
-- Behind REWARDS_ENABLED (default off, the master switch) and the admin's own
-- switch in the settings. Rules in lib/rewards.ts; every number is a setting
-- the team edits in admin (`reward_settings`).
--
-- NUMBERING: runs after 0049 (gift credit). Built in parallel with the
-- Detlio Guarantee (0051), bypass reports (0052) and the service history
-- certificate (0053); nothing here depends on those, and they do not touch
-- these tables.
--
-- Changes:
--
--   - `discounts.source`: 'admin' (every existing code) or 'reward'. A reward
--     voucher IS a promo code: one row per voucher, fixed ₹ off, once, for
--     one customer, Detlio-funded, never on Home or at one garage only (CHECK).
--     So checkout, the per-code lock, DISCOUNT_HELD (spent while the booking
--     is live or a customer no-show; given back on any other cancel or a
--     refund), receipts, commission and payouts all treat it exactly like a
--     Detlio-funded promo, with no new money path. Admin's Discounts page
--     never lists them.
--   - `reward_settings`: every number of the programme, versioned. Each save
--     in admin is a new row (the latest is in force), with the typed name; the
--     change (before → after) is also in admin_audit_log. Version 1 is the
--     defaults (DEFAULT_REWARDS_SETTINGS, pinned by rewards.test.ts).
--   - `users.birthday_month` / `birthday_day`: an optional birthday (no year),
--     for the Platinum-and-up birthday voucher.
--   - `reward_bookings`: each completed booking chain judged once — earned a
--     stamp or why not (text + CHECK). One stamp per car per IST day (partial
--     unique index). `revoked_at` when a Test mark or a refund came later.
--   - `reward_vouchers`: one per voucher, naming its `discounts` row (unique,
--     RESTRICT). Kind (text + CHECK), amount, expiry; a team cancel or a
--     manual voucher records who and why.
--   - `reward_scratch_cards`: one per stamp-earning chain (unique); the prize
--     is drawn when the card is made (`drawn_outcome`) and, past the monthly
--     cap, swapped for a bonus stamp (`fell_back`).
--   - `reward_stamps`: the Shine Card's stamps (booking, scratch card bonus,
--     streak bonus, team adjustment), each lapsing on its own; `voucher_id`
--     once five became a voucher, `voided_at` when taken back.
--   - `reward_level_drops`: a customer no-show, one per chain, with the level
--     before and after.
--   - `reward_perks`: a level's birthday voucher and annual detailing
--     voucher, once per customer per IST calendar year each (unique).
--   - `reward_invite_opens`: an invite page opened (inviter and time only),
--     for the admin's invite funnel.
--   - `reward_referral_codes` / `reward_referrals`: each customer's invite
--     code, and each invite taken up, with a keyed hash of the new customer's
--     phone (never the number) so a number is rewarded once, ever.
--   - `reward_nudges`: the habit nudges sent (push + Updates), one per
--     subject (unique), at most one per customer per 3 days.
--   - `reward_cap_months`: the months the cap was reached (one ops alert).
--
-- Every table cascades with the customer (DELETE /users/me), and every row
-- about a booking with that booking (the pilot reset, Delete forever), except
-- an invite's `referee_id` and booking, which are SET NULL so a deleted
-- account's number still cannot be rewarded again.
--
-- Purely additive: new tables, one NOT NULL column with a constant default
-- (no table rewrite on PostgreSQL 11+) and two nullable ones that today's
-- API never reads,
-- so it is safe to apply before the code that uses it is deployed.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

ALTER TABLE "discounts" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discounts_source_check') THEN
    ALTER TABLE "discounts" ADD CONSTRAINT "discounts_source_check" CHECK ("source" IN ('admin', 'reward'));
  END IF;
  -- A reward voucher is Detlio's cost, good at every garage, once, and never
  -- an offer card on Home.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discounts_reward_shape_check') THEN
    ALTER TABLE "discounts" ADD CONSTRAINT "discounts_reward_shape_check" CHECK (
      "source" = 'admin'
      OR (
        "funded_by" = 'platform'
        AND "vendor_id" IS NULL
        AND NOT "show_on_home"
        AND "discount_type" = 'fixed'
        AND "total_usage_limit" = 1
        AND "per_user_limit" = 1
        AND "ends_at" IS NOT NULL
      )
    );
  END IF;
END
$$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_settings" (
  "version" integer PRIMARY KEY NOT NULL,
  "settings" jsonb NOT NULL,
  "actor_name" varchar(100) NOT NULL,
  "actor_sub" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reward_settings_version_check" CHECK ("version" >= 1),
  CONSTRAINT "reward_settings_object_check" CHECK (jsonb_typeof("settings") = 'object')
);--> statement-breakpoint

-- Version 1: the defaults the owner approved on 18 Oct 2026 (lib/rewards.ts
-- DEFAULT_REWARDS_SETTINGS; rewards.test.ts fails if the two drift).
INSERT INTO "reward_settings" ("version", "settings", "actor_name")
VALUES (1, '{"enabled":true,"stampsPerCard":5,"minPaidAmount":199,"stampValidMonths":6,"voucherValidDays":60,"scratchCardValidDays":30,"scratchAmounts":{"small_off":20,"medium_off":50,"big_off":100,"free_wash":299},"scratchWeights":{"small_off":40,"medium_off":30,"big_off":10,"bonus_stamp":18,"free_wash":2},"streakMonths":3,"streakBonusStamps":1,"levelWindowMonths":12,"noShowDropMonths":12,"levels":[{"key":"member","label":"Member","minBookings":0,"cardReward":299,"birthdayVoucher":null,"annualDetailingVoucher":null,"scratchWeights":null,"garageBadge":false},{"key":"silver","label":"Silver","minBookings":3,"cardReward":299,"birthdayVoucher":null,"annualDetailingVoucher":null,"scratchWeights":null,"garageBadge":false},{"key":"gold","label":"Gold","minBookings":10,"cardReward":349,"birthdayVoucher":null,"annualDetailingVoucher":null,"scratchWeights":null,"garageBadge":false},{"key":"platinum","label":"Platinum","minBookings":25,"cardReward":399,"birthdayVoucher":399,"annualDetailingVoucher":null,"scratchWeights":null,"garageBadge":false},{"key":"diamond","label":"Diamond","minBookings":50,"cardReward":449,"birthdayVoucher":399,"annualDetailingVoucher":null,"scratchWeights":{"small_off":25,"medium_off":30,"big_off":20,"bonus_stamp":20,"free_wash":5},"garageBadge":true},{"key":"icon","label":"Detlio Icon","minBookings":100,"cardReward":499,"birthdayVoucher":399,"annualDetailingVoucher":1500,"scratchWeights":{"small_off":25,"medium_off":30,"big_off":20,"bonus_stamp":20,"free_wash":5},"garageBadge":true}],"referralAmount":100,"referralMaxPerYear":10,"monthlyCap":10000,"nudgeGapDays":3,"expiryWarningDays":7}'::jsonb, 'Detlio (defaults)')
ON CONFLICT ("version") DO NOTHING;--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birthday_month" smallint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birthday_day" smallint;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_birthday_check') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_birthday_check" CHECK (
      ("birthday_month" IS NULL) = ("birthday_day" IS NULL)
      AND ("birthday_month" IS NULL OR ("birthday_month" BETWEEN 1 AND 12 AND "birthday_day" BETWEEN 1 AND 31))
    );
  END IF;
END
$$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_bookings" (
  "root_booking_id" uuid PRIMARY KEY NOT NULL,
  "booking_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "vehicle_id" uuid NOT NULL,
  "vendor_id" uuid NOT NULL,
  "completed_at" timestamp with time zone NOT NULL,
  "ist_day" date NOT NULL,
  "eligible_amount" numeric(10, 2) NOT NULL,
  "discount_percent" smallint DEFAULT 0 NOT NULL,
  "earned" boolean NOT NULL,
  "refusal" text,
  "revoked_at" timestamp with time zone,
  "revoke_reason" text,
  "judged_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reward_bookings_root_booking_id_fk"
    FOREIGN KEY ("root_booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_bookings_booking_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_bookings_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_bookings_vehicle_id_fk"
    FOREIGN KEY ("vehicle_id") REFERENCES "public"."user_vehicles"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_bookings_vendor_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_bookings_refusal_check" CHECK (
    "refusal" IN ('not_completed', 'not_paid_online', 'refunded', 'test', 'under_minimum', 'same_day_car')
  ),
  CONSTRAINT "reward_bookings_earned_check" CHECK ("earned" = ("refusal" IS NULL)),
  CONSTRAINT "reward_bookings_revoked_check" CHECK (
    ("revoked_at" IS NULL) = ("revoke_reason" IS NULL)
    AND ("revoked_at" IS NULL OR "earned")
    AND ("revoke_reason" IS NULL OR "revoke_reason" IN ('test', 'refunded'))
  ),
  CONSTRAINT "reward_bookings_discount_percent_check" CHECK ("discount_percent" BETWEEN 0 AND 100)
);--> statement-breakpoint

-- One stamp per car per IST day, under any race.
CREATE UNIQUE INDEX IF NOT EXISTS "reward_bookings_car_day_key"
  ON "reward_bookings" ("vehicle_id", "ist_day")
  WHERE "earned";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reward_bookings_user_id_idx"
  ON "reward_bookings" ("user_id", "completed_at");--> statement-breakpoint
-- Level distribution, streaks and the garage badge: earned bookings by customer.
CREATE INDEX IF NOT EXISTS "reward_bookings_earned_idx"
  ON "reward_bookings" ("user_id", "completed_at")
  WHERE "earned" AND "revoked_at" IS NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_vouchers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "discount_id" uuid NOT NULL,
  "level" text,
  "source_booking_id" uuid,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "reason" varchar(300),
  "actor_name" varchar(100),
  "cancelled_at" timestamp with time zone,
  "cancelled_by" varchar(100),
  "cancel_reason" varchar(300),
  CONSTRAINT "reward_vouchers_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_vouchers_discount_id_fk"
    FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "reward_vouchers_source_booking_id_fk"
    FOREIGN KEY ("source_booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "reward_vouchers_kind_check" CHECK (
    "kind" IN ('shine', 'scratch', 'free_wash', 'referral', 'birthday', 'annual_detailing', 'adjustment')
  ),
  -- The level a Shine Card or perk voucher was issued at.
  CONSTRAINT "reward_vouchers_level_check" CHECK (
    "level" IS NULL OR "level" IN ('member', 'silver', 'gold', 'platinum', 'diamond', 'icon')
  ),
  CONSTRAINT "reward_vouchers_amount_check" CHECK ("amount" > 0 AND "amount" <= 5000),
  CONSTRAINT "reward_vouchers_expiry_check" CHECK ("expires_at" > "issued_at"),
  CONSTRAINT "reward_vouchers_adjustment_check" CHECK (
    "kind" <> 'adjustment' OR ("reason" IS NOT NULL AND "actor_name" IS NOT NULL)
  ),
  CONSTRAINT "reward_vouchers_cancelled_check" CHECK (
    ("cancelled_at" IS NULL) = ("cancelled_by" IS NULL)
    AND ("cancelled_at" IS NULL) = ("cancel_reason" IS NULL)
  )
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "reward_vouchers_discount_id_key" ON "reward_vouchers" ("discount_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reward_vouchers_user_id_idx" ON "reward_vouchers" ("user_id", "issued_at");--> statement-breakpoint
-- The month's rewards issued (the cap) and the expiry nudges.
CREATE INDEX IF NOT EXISTS "reward_vouchers_issued_at_idx" ON "reward_vouchers" ("issued_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reward_vouchers_expires_at_idx" ON "reward_vouchers" ("expires_at") WHERE "cancelled_at" IS NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_scratch_cards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "root_booking_id" uuid NOT NULL,
  "outcome" text NOT NULL,
  "prize_amount" numeric(10, 2),
  "drawn_outcome" text NOT NULL,
  "fell_back" boolean DEFAULT false NOT NULL,
  "level" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "scratched_at" timestamp with time zone,
  "voided_at" timestamp with time zone,
  "voucher_id" uuid,
  CONSTRAINT "reward_scratch_cards_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_scratch_cards_root_booking_id_fk"
    FOREIGN KEY ("root_booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_scratch_cards_voucher_id_fk"
    FOREIGN KEY ("voucher_id") REFERENCES "public"."reward_vouchers"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "reward_scratch_cards_outcome_check" CHECK (
    "outcome" IN ('small_off', 'medium_off', 'big_off', 'bonus_stamp', 'free_wash')
    AND "drawn_outcome" IN ('small_off', 'medium_off', 'big_off', 'bonus_stamp', 'free_wash')
  ),
  -- Money prizes carry their amount; a bonus stamp has none.
  CONSTRAINT "reward_scratch_cards_prize_check" CHECK (("outcome" = 'bonus_stamp') = ("prize_amount" IS NULL)),
  -- Only a money prize past the cap falls back, and it falls back to a stamp.
  CONSTRAINT "reward_scratch_cards_fell_back_check" CHECK (
    NOT "fell_back" OR ("outcome" = 'bonus_stamp' AND "drawn_outcome" <> 'bonus_stamp')
  ),
  CONSTRAINT "reward_scratch_cards_voucher_check" CHECK ("voucher_id" IS NULL OR "scratched_at" IS NOT NULL),
  -- The level whose odds drew it.
  CONSTRAINT "reward_scratch_cards_level_check" CHECK ("level" IN ('member', 'silver', 'gold', 'platinum', 'diamond', 'icon'))
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "reward_scratch_cards_root_booking_key" ON "reward_scratch_cards" ("root_booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reward_scratch_cards_user_id_idx" ON "reward_scratch_cards" ("user_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reward_scratch_cards_created_at_idx" ON "reward_scratch_cards" ("created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_stamps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "source" text NOT NULL,
  "booking_id" uuid,
  "scratch_card_id" uuid,
  "streak_month" varchar(7),
  "earned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "voucher_id" uuid,
  "voided_at" timestamp with time zone,
  "void_reason" varchar(300),
  "reason" varchar(300),
  "actor_name" varchar(100),
  CONSTRAINT "reward_stamps_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_stamps_booking_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_stamps_scratch_card_id_fk"
    FOREIGN KEY ("scratch_card_id") REFERENCES "public"."reward_scratch_cards"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_stamps_voucher_id_fk"
    FOREIGN KEY ("voucher_id") REFERENCES "public"."reward_vouchers"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "reward_stamps_source_check" CHECK ("source" IN ('booking', 'scratch', 'streak', 'adjustment')),
  -- Each kind names what earned it.
  CONSTRAINT "reward_stamps_source_fields_check" CHECK (
    ("source" = 'booking') = ("booking_id" IS NOT NULL)
    AND ("source" = 'scratch') = ("scratch_card_id" IS NOT NULL)
    AND ("source" = 'streak') = ("streak_month" IS NOT NULL)
    AND ("source" <> 'adjustment' OR ("reason" IS NOT NULL AND "actor_name" IS NOT NULL))
  ),
  CONSTRAINT "reward_stamps_voided_check" CHECK (
    ("voided_at" IS NULL) = ("void_reason" IS NULL)
    AND ("voided_at" IS NULL OR "voucher_id" IS NULL)
  ),
  CONSTRAINT "reward_stamps_expiry_check" CHECK ("expires_at" > "earned_at")
);--> statement-breakpoint

-- A booking chain earns one stamp, a scratch card one, a month one streak bonus.
CREATE UNIQUE INDEX IF NOT EXISTS "reward_stamps_booking_key" ON "reward_stamps" ("booking_id") WHERE "source" = 'booking';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reward_stamps_scratch_card_key" ON "reward_stamps" ("scratch_card_id") WHERE "source" = 'scratch';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reward_stamps_streak_key" ON "reward_stamps" ("user_id", "streak_month") WHERE "source" = 'streak';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reward_stamps_user_id_idx" ON "reward_stamps" ("user_id", "earned_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reward_stamps_on_card_idx"
  ON "reward_stamps" ("expires_at")
  WHERE "voucher_id" IS NULL AND "voided_at" IS NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_level_drops" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "root_booking_id" uuid NOT NULL,
  "from_level" text NOT NULL,
  "to_level" text NOT NULL,
  "dropped_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reward_level_drops_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_level_drops_root_booking_id_fk"
    FOREIGN KEY ("root_booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_level_drops_levels_check" CHECK (
    "from_level" IN ('member', 'silver', 'gold', 'platinum', 'diamond', 'icon')
    AND "to_level" IN ('member', 'silver', 'gold', 'platinum', 'diamond', 'icon')
  )
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "reward_level_drops_root_booking_key" ON "reward_level_drops" ("root_booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reward_level_drops_user_id_idx" ON "reward_level_drops" ("user_id", "dropped_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_perks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "year" smallint NOT NULL,
  "level" text NOT NULL,
  "voucher_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reward_perks_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_perks_voucher_id_fk"
    FOREIGN KEY ("voucher_id") REFERENCES "public"."reward_vouchers"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "reward_perks_kind_check" CHECK ("kind" IN ('birthday', 'annual_detailing')),
  CONSTRAINT "reward_perks_level_check" CHECK ("level" IN ('member', 'silver', 'gold', 'platinum', 'diamond', 'icon')),
  CONSTRAINT "reward_perks_year_check" CHECK ("year" BETWEEN 2026 AND 2200)
);--> statement-breakpoint

-- Once per customer, per perk, per IST calendar year.
CREATE UNIQUE INDEX IF NOT EXISTS "reward_perks_user_kind_year_key" ON "reward_perks" ("user_id", "kind", "year");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_referral_codes" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "code" varchar(8) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reward_referral_codes_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_referral_codes_code_check" CHECK ("code" ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$')
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "reward_referral_codes_code_key" ON "reward_referral_codes" ("code");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_referrals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "referrer_id" uuid NOT NULL,
  "referee_id" uuid,
  "referee_phone_hash" varchar(64) NOT NULL,
  "invite_opened_at" timestamp with time zone NOT NULL,
  "claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "refusal" text,
  "root_booking_id" uuid,
  "settled_at" timestamp with time zone,
  "referrer_voucher_id" uuid,
  "referee_voucher_id" uuid,
  CONSTRAINT "reward_referrals_referrer_id_fk"
    FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_referrals_referee_id_fk"
    FOREIGN KEY ("referee_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "reward_referrals_root_booking_id_fk"
    FOREIGN KEY ("root_booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "reward_referrals_referrer_voucher_id_fk"
    FOREIGN KEY ("referrer_voucher_id") REFERENCES "public"."reward_vouchers"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "reward_referrals_referee_voucher_id_fk"
    FOREIGN KEY ("referee_voucher_id") REFERENCES "public"."reward_vouchers"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "reward_referrals_status_check" CHECK ("status" IN ('pending', 'rewarded', 'refused')),
  CONSTRAINT "reward_referrals_refusal_check" CHECK (
    ("status" = 'refused') = ("refusal" IS NOT NULL)
    AND ("refusal" IS NULL OR "refusal" IN ('same_car'))
  ),
  CONSTRAINT "reward_referrals_settled_check" CHECK (("status" = 'pending') = ("settled_at" IS NULL)),
  CONSTRAINT "reward_referrals_self_check" CHECK ("referee_id" IS NULL OR "referee_id" <> "referrer_id")
);--> statement-breakpoint

-- A customer is referred once, and a phone number once, ever.
CREATE UNIQUE INDEX IF NOT EXISTS "reward_referrals_referee_id_key" ON "reward_referrals" ("referee_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reward_referrals_phone_hash_key" ON "reward_referrals" ("referee_phone_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reward_referrals_referrer_id_idx" ON "reward_referrals" ("referrer_id", "settled_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_invite_opens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "referrer_id" uuid NOT NULL,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reward_invite_opens_referrer_id_fk"
    FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "reward_invite_opens_opened_at_idx" ON "reward_invite_opens" ("opened_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_nudges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "subject_key" varchar(120) NOT NULL,
  "title" varchar(120) NOT NULL,
  "body" varchar(200) NOT NULL,
  "link_url" varchar(200) NOT NULL,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reward_nudges_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_nudges_kind_check" CHECK ("kind" IN ('expiring', 'one_away', 'wash_due')),
  CONSTRAINT "reward_nudges_link_check" CHECK ("link_url" ~ '^/[A-Za-z0-9/_?=&.-]*$')
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "reward_nudges_subject_key" ON "reward_nudges" ("user_id", "kind", "subject_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reward_nudges_user_id_idx" ON "reward_nudges" ("user_id", "sent_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_cap_months" (
  "month" varchar(7) PRIMARY KEY NOT NULL,
  "reached_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reward_cap_months_month_check" CHECK ("month" ~ '^[0-9]{4}-[0-9]{2}$')
);
