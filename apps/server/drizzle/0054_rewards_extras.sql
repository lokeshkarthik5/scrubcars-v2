-- Detlio Rewards extras: achievements (badges), seasonal challenges and
-- Detlio Wrapped, on top of Detlio Rewards (0050). Rules in
-- lib/achievements.ts, lib/challenges.ts and lib/wrapped.ts; module
-- modules/reward-extras. Behind the same switches as 0050 (REWARDS_ENABLED
-- and the admin's): while rewards are not live nothing here is read,
-- written or sent.
--
-- NUMBERING: written on top of 0050. 0051 (Detlio Guarantee), 0052 (bypass
-- reports) and 0053 (service history certificate) are on other branches
-- that merge before this one; until they do, the journal skips from 0050
-- to 0054 and `migrate.sh lint` reports the gap. Nothing here depends on
-- them, and they do not touch these tables.
--
-- Changes:
--
--   - `reward_bookings.extras_at`: when a stamp-earning chain was counted for
--     badges and challenges (claimed once, in the same transaction).
--   - `reward_stamps`: two new sources, 'badge' (a badge's bonus stamps,
--     `badge_award_id`) and 'challenge' (a challenge's prize or its
--     "double stamps", `challenge_id`). The source CHECKs are widened.
--   - `reward_vouchers.kind`: 'challenge' (a challenge's ₹ prize), still a
--     Detlio-funded promo code counted toward the monthly budget.
--   - `reward_nudges.kind`: 'badge', 'challenge_start', 'challenge_one_left',
--     'challenge_won', 'wrapped'. Badges, wins and Wrapped are celebrations:
--     they never wait for, nor use up, the 3-day nudge gap (the queries
--     leave them out); a challenge starting or "one to go" counts like any
--     0050 nudge.
--   - `reward_challenges`: the team's challenges (draft until published),
--     their window (IST dates), goal, filters, reward, audience and winners
--     cap. Two examples are seeded as drafts (not live).
--   - `reward_challenge_bookings`: each booking counted toward a challenge
--     (once), with the extra stamps "double stamps" gave it.
--   - `reward_challenge_winners`: who won, once each, with what was given.
--   - `reward_badge_awards`: badges earned, once each (a challenge's badge
--     names its challenge), with the bonus stamps given and when the
--     customer saw the celebration.
--   - `reward_badge_checks`: the nightly badge pass's place, per customer.
--   - `reward_wrapped`: a customer-year's Wrapped stats (cached), and how
--     often it was opened and shared (counts only).
--
-- Everything about a customer cascades with them (DELETE /users/me); rows
-- about a booking cascade with it, or let go of it (SET NULL) where the
-- badge or the win should stay. A challenge is never deleted (ended).
--
-- Purely additive relative to the 0050 code: one nullable column, two
-- nullable columns, widened CHECKs (every row 0050's code writes still
-- passes) and new tables. Applied by scripts/migrate.sh in one transaction;
-- every statement is safe to re-run.

ALTER TABLE "reward_bookings" ADD COLUMN IF NOT EXISTS "extras_at" timestamp with time zone;--> statement-breakpoint

-- Badges and challenges catch-up: earned chains not yet counted.
CREATE INDEX IF NOT EXISTS "reward_bookings_extras_idx"
  ON "reward_bookings" ("judged_at")
  WHERE "earned" AND "revoked_at" IS NULL AND "extras_at" IS NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(60) NOT NULL,
  "description" varchar(200),
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "goal_count" smallint NOT NULL,
  "category" text,
  "booking_type" text,
  "reward_kind" text NOT NULL,
  "reward_stamps" smallint,
  "reward_amount" numeric(10, 2),
  "reward_multiplier" smallint,
  "audience_min_level" text,
  "max_winners" integer,
  "created_by" varchar(100) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_at" timestamp with time zone,
  "published_by" varchar(100),
  "ended_at" timestamp with time zone,
  "ended_by" varchar(100),
  CONSTRAINT "reward_challenges_dates_check" CHECK ("end_date" >= "start_date" AND "end_date" - "start_date" < 92),
  CONSTRAINT "reward_challenges_goal_check" CHECK ("goal_count" BETWEEN 1 AND 20),
  CONSTRAINT "reward_challenges_category_check" CHECK (
    "category" IS NULL OR "category" IN ('car_wash', 'detailing', 'coating', 'scratch_removal', 'others', 'package')
  ),
  CONSTRAINT "reward_challenges_booking_type_check" CHECK ("booking_type" IS NULL OR "booking_type" IN ('dropin', 'doorstep', 'pickup')),
  CONSTRAINT "reward_challenges_reward_check" CHECK (
    "reward_kind" IN ('stamps', 'voucher', 'multiplier', 'badge')
    AND ("reward_kind" = 'stamps') = ("reward_stamps" IS NOT NULL)
    AND ("reward_kind" = 'voucher') = ("reward_amount" IS NOT NULL)
    AND ("reward_kind" = 'multiplier') = ("reward_multiplier" IS NOT NULL)
    AND ("reward_stamps" IS NULL OR "reward_stamps" BETWEEN 1 AND 10)
    AND ("reward_amount" IS NULL OR ("reward_amount" > 0 AND "reward_amount" <= 2000))
    AND ("reward_multiplier" IS NULL OR "reward_multiplier" BETWEEN 2 AND 3)
    -- A ₹ prize always has a cap on winners: the budget's worst case.
    AND ("reward_kind" <> 'voucher' OR "max_winners" IS NOT NULL)
  ),
  CONSTRAINT "reward_challenges_audience_check" CHECK (
    "audience_min_level" IS NULL OR "audience_min_level" IN ('member', 'silver', 'gold', 'platinum', 'diamond', 'icon')
  ),
  CONSTRAINT "reward_challenges_max_winners_check" CHECK ("max_winners" IS NULL OR "max_winners" BETWEEN 1 AND 100000),
  CONSTRAINT "reward_challenges_published_check" CHECK (("published_at" IS NULL) = ("published_by" IS NULL)),
  CONSTRAINT "reward_challenges_ended_check" CHECK (
    ("ended_at" IS NULL) = ("ended_by" IS NULL) AND ("ended_at" IS NULL OR "published_at" IS NOT NULL)
  )
);--> statement-breakpoint

-- Live and scheduled challenges, read on every judged booking and Home.
CREATE INDEX IF NOT EXISTS "reward_challenges_window_idx"
  ON "reward_challenges" ("end_date", "start_date")
  WHERE "published_at" IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_badge_awards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "badge_key" text NOT NULL,
  "challenge_id" uuid,
  "root_booking_id" uuid,
  "bonus_stamps" smallint DEFAULT 0 NOT NULL,
  "earned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "seen_at" timestamp with time zone,
  CONSTRAINT "reward_badge_awards_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_badge_awards_challenge_id_fk"
    FOREIGN KEY ("challenge_id") REFERENCES "public"."reward_challenges"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_badge_awards_root_booking_id_fk"
    FOREIGN KEY ("root_booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "reward_badge_awards_key_check" CHECK (
    "badge_key" IN (
      'first_shine', 'washes_5', 'washes_25', 'washes_50', 'washes_100',
      'streak_3', 'streak_6', 'streak_12', 'monsoon_shine', 'early_bird', 'night_owl',
      'explorer', 'loyal_regular', 'pickup_pro', 'doorstep_devotee', 'reviewer',
      'ambassador', 'detailing_devotee', 'coating_club', 'challenge'
    )
  ),
  -- A challenge's own badge names its challenge; no other badge does.
  CONSTRAINT "reward_badge_awards_challenge_check" CHECK (("badge_key" = 'challenge') = ("challenge_id" IS NOT NULL)),
  CONSTRAINT "reward_badge_awards_bonus_check" CHECK ("bonus_stamps" BETWEEN 0 AND 10)
);--> statement-breakpoint

-- Each badge once per customer, under any race.
CREATE UNIQUE INDEX IF NOT EXISTS "reward_badge_awards_user_badge_key"
  ON "reward_badge_awards" ("user_id", "badge_key")
  WHERE "challenge_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reward_badge_awards_user_challenge_key"
  ON "reward_badge_awards" ("user_id", "challenge_id")
  WHERE "challenge_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reward_badge_awards_earned_at_idx" ON "reward_badge_awards" ("earned_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_challenge_bookings" (
  "challenge_id" uuid NOT NULL,
  "root_booking_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "counted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "extra_stamps" smallint DEFAULT 0 NOT NULL,
  CONSTRAINT "reward_challenge_bookings_pk" PRIMARY KEY ("challenge_id", "root_booking_id"),
  CONSTRAINT "reward_challenge_bookings_challenge_id_fk"
    FOREIGN KEY ("challenge_id") REFERENCES "public"."reward_challenges"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_challenge_bookings_root_booking_id_fk"
    FOREIGN KEY ("root_booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_challenge_bookings_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_challenge_bookings_extra_check" CHECK ("extra_stamps" BETWEEN 0 AND 2)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "reward_challenge_bookings_user_idx"
  ON "reward_challenge_bookings" ("user_id", "challenge_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_challenge_winners" (
  "challenge_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "won_at" timestamp with time zone DEFAULT now() NOT NULL,
  "root_booking_id" uuid,
  "voucher_id" uuid,
  "bonus_stamps" smallint DEFAULT 0 NOT NULL,
  "badge_award_id" uuid,
  CONSTRAINT "reward_challenge_winners_pk" PRIMARY KEY ("challenge_id", "user_id"),
  CONSTRAINT "reward_challenge_winners_challenge_id_fk"
    FOREIGN KEY ("challenge_id") REFERENCES "public"."reward_challenges"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_challenge_winners_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_challenge_winners_root_booking_id_fk"
    FOREIGN KEY ("root_booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "reward_challenge_winners_voucher_id_fk"
    FOREIGN KEY ("voucher_id") REFERENCES "public"."reward_vouchers"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "reward_challenge_winners_badge_award_id_fk"
    FOREIGN KEY ("badge_award_id") REFERENCES "public"."reward_badge_awards"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "reward_challenge_winners_bonus_check" CHECK ("bonus_stamps" BETWEEN 0 AND 200)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "reward_challenge_winners_user_idx" ON "reward_challenge_winners" ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_badge_checks" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "checked_at" timestamp with time zone NOT NULL,
  CONSTRAINT "reward_badge_checks_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "reward_wrapped" (
  "user_id" uuid NOT NULL,
  "year" smallint NOT NULL,
  "stats" jsonb NOT NULL,
  "computed_at" timestamp with time zone NOT NULL,
  "opened_count" integer DEFAULT 0 NOT NULL,
  "first_opened_at" timestamp with time zone,
  "shared_count" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "reward_wrapped_pk" PRIMARY KEY ("user_id", "year"),
  CONSTRAINT "reward_wrapped_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "reward_wrapped_year_check" CHECK ("year" BETWEEN 2026 AND 2200),
  CONSTRAINT "reward_wrapped_stats_check" CHECK (jsonb_typeof("stats") = 'object'),
  CONSTRAINT "reward_wrapped_counts_check" CHECK ("opened_count" >= 0 AND "shared_count" >= 0)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "reward_wrapped_year_idx" ON "reward_wrapped" ("year");--> statement-breakpoint

-- Stamps: a badge's bonus and a challenge's prize.
ALTER TABLE "reward_stamps" ADD COLUMN IF NOT EXISTS "badge_award_id" uuid;--> statement-breakpoint
ALTER TABLE "reward_stamps" ADD COLUMN IF NOT EXISTS "challenge_id" uuid;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reward_stamps_badge_award_id_fk') THEN
    ALTER TABLE "reward_stamps" ADD CONSTRAINT "reward_stamps_badge_award_id_fk"
      FOREIGN KEY ("badge_award_id") REFERENCES "public"."reward_badge_awards"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reward_stamps_challenge_id_fk') THEN
    ALTER TABLE "reward_stamps" ADD CONSTRAINT "reward_stamps_challenge_id_fk"
      FOREIGN KEY ("challenge_id") REFERENCES "public"."reward_challenges"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;--> statement-breakpoint

ALTER TABLE "reward_stamps" DROP CONSTRAINT IF EXISTS "reward_stamps_source_check";--> statement-breakpoint
ALTER TABLE "reward_stamps" ADD CONSTRAINT "reward_stamps_source_check"
  CHECK ("source" IN ('booking', 'scratch', 'streak', 'adjustment', 'badge', 'challenge'));--> statement-breakpoint
ALTER TABLE "reward_stamps" DROP CONSTRAINT IF EXISTS "reward_stamps_source_fields_check";--> statement-breakpoint
ALTER TABLE "reward_stamps" ADD CONSTRAINT "reward_stamps_source_fields_check" CHECK (
  ("source" = 'booking') = ("booking_id" IS NOT NULL)
  AND ("source" = 'scratch') = ("scratch_card_id" IS NOT NULL)
  AND ("source" = 'streak') = ("streak_month" IS NOT NULL)
  AND ("source" = 'badge') = ("badge_award_id" IS NOT NULL)
  AND ("source" = 'challenge') = ("challenge_id" IS NOT NULL)
  AND ("source" <> 'adjustment' OR ("reason" IS NOT NULL AND "actor_name" IS NOT NULL))
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "reward_stamps_badge_award_idx" ON "reward_stamps" ("badge_award_id") WHERE "badge_award_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reward_stamps_challenge_idx" ON "reward_stamps" ("challenge_id") WHERE "challenge_id" IS NOT NULL;--> statement-breakpoint

-- Vouchers: a challenge's ₹ prize.
ALTER TABLE "reward_vouchers" DROP CONSTRAINT IF EXISTS "reward_vouchers_kind_check";--> statement-breakpoint
ALTER TABLE "reward_vouchers" ADD CONSTRAINT "reward_vouchers_kind_check" CHECK (
  "kind" IN ('shine', 'scratch', 'free_wash', 'referral', 'birthday', 'annual_detailing', 'adjustment', 'challenge')
);--> statement-breakpoint

-- Nudges: badges, challenges and Wrapped.
ALTER TABLE "reward_nudges" DROP CONSTRAINT IF EXISTS "reward_nudges_kind_check";--> statement-breakpoint
ALTER TABLE "reward_nudges" ADD CONSTRAINT "reward_nudges_kind_check" CHECK (
  "kind" IN ('expiring', 'one_away', 'wash_due', 'badge', 'challenge_start', 'challenge_one_left', 'challenge_won', 'wrapped')
);--> statement-breakpoint

-- Two examples for the team, as drafts: nobody sees them until published.
INSERT INTO "reward_challenges" (
  "id", "title", "description", "start_date", "end_date", "goal_count", "category", "booking_type",
  "reward_kind", "reward_stamps", "reward_amount", "reward_multiplier", "audience_min_level", "max_winners", "created_by"
)
VALUES
  (
    '5e1d0c4a-2b7e-4f39-9c1d-0054d1a10001', 'Diwali Shine', 'Book 3 washes in Diwali week and every one of them earns double stamps.',
    '2026-11-05', '2026-11-11', 3, NULL, NULL,
    'multiplier', NULL, NULL, 2, NULL, 1000, 'Detlio (example)'
  ),
  (
    '5e1d0c4a-2b7e-4f39-9c1d-0054d1a10002', 'Monsoon Care', 'Book 2 washes in July and get ₹100 off your next booking.',
    '2027-07-01', '2027-07-31', 2, NULL, NULL,
    'voucher', NULL, 100.00, NULL, NULL, 200, 'Detlio (example)'
  )
ON CONFLICT ("id") DO NOTHING;
