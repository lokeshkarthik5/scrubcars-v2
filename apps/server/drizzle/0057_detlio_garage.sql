-- The Detlio Garage: a collectible series of fictional hypercar cards
-- customers earn by booking through Detlio (owner, 18 Oct 2026). Rules in
-- lib/garage.ts, Series 1 in lib/garage-series.ts, module modules/garage.
-- On top of Detlio Rewards (0050) and its extras (0054), behind the same
-- switches plus the Garage's own (settings.garage.enabled, off by
-- default): while it is not live nothing here is read, written or sent.
--
-- Changes:
--
--   - `garage_series`: a series (number, name, draft/live/ended, optional
--     start and end). Series 1 is seeded live; the team turns the Garage on
--     in admin.
--   - `garage_cars`: its cars, numbered 1–40 (rows of five by number):
--     invented name, rarity, the card's tone, paint (the drawn picture's
--     colour), colour name, three stat chips, a one-line story, on/off, and
--     the picture: `default` (drawn from numbers, no URL), `ai` or
--     `upload` (a public R2 URL under garage/series-<n>/). Series 1's 40
--     cars are seeded (20 Common, 12 Rare, 6 Epic, 2 Legendary).
--   - `garage_pulls`: every card a customer got, with where it came from
--     (a booking, a scratch card, a challenge, a badge, the team), its
--     rarity, whether it was a duplicate (and when a duplicate went into a
--     bonus stamp), the pity that forced it, and when the customer saw it.
--     One per stamp-earning booking chain and one per scratch card (partial
--     unique indexes).
--   - `garage_collections`: what each customer owns, a count per car. A
--     trigger keeps it in step when pulls are deleted (with a booking by
--     the pilot reset or Delete forever, or with the account).
--   - `garage_row_completions` and `garage_series_completions`: a finished
--     row (its voucher, or the bonus stamps past the budget) and a finished
--     series (the Garage Legend badge), once each. A series completion is
--     the hook for any future grand prize: nothing else hangs on it yet.
--   - Rewards (widened CHECKs, one column each): `reward_stamps` source
--     'garage' (`garage_pull_id`), `reward_vouchers` kind 'garage_row',
--     `reward_nudges` kinds 'garage_card', 'garage_row', 'garage_series'
--     (celebrations: they never wait for the nudge gap), the badge
--     'garage_legend', the scratch card outcome 'garage_card' (no amount),
--     and a challenge reward 'garage_cards' (`reward_cards`, 1–5).
--
-- Everything about a customer cascades with them (DELETE /users/me); a
-- pull about a booking cascades with it. Series and cars are never
-- deleted (switched off or ended).
--
-- Purely additive relative to the code in production: new tables, two
-- nullable columns, widened CHECKs (every row the current code writes still
-- passes). Applied by scripts/migrate.sh in one transaction; every
-- statement is safe to re-run.

-- ─── Series and cars ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "garage_series" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "number" smallint NOT NULL,
  "name" varchar(40) NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" varchar(100),
  CONSTRAINT "garage_series_number_check" CHECK ("number" BETWEEN 1 AND 999),
  CONSTRAINT "garage_series_status_check" CHECK ("status" IN ('draft', 'live', 'ended')),
  CONSTRAINT "garage_series_window_check" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at")
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "garage_series_number_key" ON "garage_series" ("number");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_cars" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "series_id" uuid NOT NULL,
  "number" smallint NOT NULL,
  "name" varchar(28) NOT NULL,
  "rarity" text NOT NULL,
  "tone" text NOT NULL,
  "paint" varchar(7) NOT NULL,
  "colour" varchar(24) NOT NULL,
  "stats" text[] NOT NULL,
  "lore" varchar(110) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "art_source" text DEFAULT 'default' NOT NULL,
  "art_url" text,
  "art_updated_at" timestamp with time zone,
  "art_updated_by" varchar(100),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" varchar(100),
  CONSTRAINT "garage_cars_series_id_fk"
    FOREIGN KEY ("series_id") REFERENCES "public"."garage_series"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "garage_cars_number_check" CHECK ("number" BETWEEN 1 AND 40),
  CONSTRAINT "garage_cars_rarity_check" CHECK ("rarity" IN ('common', 'rare', 'epic', 'legendary')),
  CONSTRAINT "garage_cars_tone_check" CHECK ("tone" IN ('light', 'dark')),
  CONSTRAINT "garage_cars_paint_check" CHECK ("paint" ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT "garage_cars_stats_check" CHECK (array_length("stats", 1) = 3),
  CONSTRAINT "garage_cars_art_source_check" CHECK ("art_source" IN ('default', 'ai', 'upload')),
  -- A drawn picture has no URL; AI and uploaded ones always do.
  CONSTRAINT "garage_cars_art_url_check" CHECK (("art_source" = 'default') = ("art_url" IS NULL))
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "garage_cars_series_number_key" ON "garage_cars" ("series_id", "number");--> statement-breakpoint

-- ─── Pulls and collections ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "garage_pulls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "series_id" uuid NOT NULL,
  "car_id" uuid NOT NULL,
  "rarity" text NOT NULL,
  "source" text NOT NULL,
  "root_booking_id" uuid,
  "scratch_card_id" uuid,
  "challenge_id" uuid,
  "badge_award_id" uuid,
  "actor_name" varchar(100),
  "reason" varchar(300),
  "forced" text,
  "was_duplicate" boolean DEFAULT false NOT NULL,
  "converted_at" timestamp with time zone,
  "pulled_at" timestamp with time zone DEFAULT now() NOT NULL,
  "seen_at" timestamp with time zone,
  CONSTRAINT "garage_pulls_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_pulls_series_id_fk"
    FOREIGN KEY ("series_id") REFERENCES "public"."garage_series"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "garage_pulls_car_id_fk"
    FOREIGN KEY ("car_id") REFERENCES "public"."garage_cars"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "garage_pulls_root_booking_id_fk"
    FOREIGN KEY ("root_booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_pulls_scratch_card_id_fk"
    FOREIGN KEY ("scratch_card_id") REFERENCES "public"."reward_scratch_cards"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_pulls_challenge_id_fk"
    FOREIGN KEY ("challenge_id") REFERENCES "public"."reward_challenges"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_pulls_badge_award_id_fk"
    FOREIGN KEY ("badge_award_id") REFERENCES "public"."reward_badge_awards"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_pulls_rarity_check" CHECK ("rarity" IN ('common', 'rare', 'epic', 'legendary')),
  CONSTRAINT "garage_pulls_source_check" CHECK ("source" IN ('booking', 'scratch', 'challenge', 'badge', 'admin')),
  -- Each source names what earned it; a booking's pull names its chain.
  CONSTRAINT "garage_pulls_source_fields_check" CHECK (
    ("source" <> 'booking' OR "root_booking_id" IS NOT NULL)
    AND ("source" = 'scratch') = ("scratch_card_id" IS NOT NULL)
    AND ("source" = 'challenge') = ("challenge_id" IS NOT NULL)
    AND ("source" = 'badge') = ("badge_award_id" IS NOT NULL)
    AND ("source" = 'admin') = ("actor_name" IS NOT NULL)
    AND ("source" <> 'admin' OR "reason" IS NOT NULL)
  ),
  CONSTRAINT "garage_pulls_forced_check" CHECK ("forced" IS NULL OR "forced" IN ('pity_rare', 'pity_legendary')),
  -- Only a duplicate goes into a bonus stamp.
  CONSTRAINT "garage_pulls_converted_check" CHECK ("converted_at" IS NULL OR "was_duplicate")
);--> statement-breakpoint

-- One card per stamp-earning booking chain, one per scratch card, under any race.
CREATE UNIQUE INDEX IF NOT EXISTS "garage_pulls_booking_key"
  ON "garage_pulls" ("root_booking_id") WHERE "source" = 'booking';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "garage_pulls_scratch_card_key"
  ON "garage_pulls" ("scratch_card_id") WHERE "source" = 'scratch';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "garage_pulls_user_idx" ON "garage_pulls" ("user_id", "series_id", "pulled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "garage_pulls_pulled_at_idx" ON "garage_pulls" ("pulled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "garage_pulls_unseen_idx" ON "garage_pulls" ("user_id") WHERE "seen_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "garage_pulls_duplicates_idx"
  ON "garage_pulls" ("user_id") WHERE "was_duplicate" AND "converted_at" IS NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_collections" (
  "user_id" uuid NOT NULL,
  "car_id" uuid NOT NULL,
  "series_id" uuid NOT NULL,
  "count" integer NOT NULL,
  "first_pulled_at" timestamp with time zone NOT NULL,
  "last_pulled_at" timestamp with time zone NOT NULL,
  CONSTRAINT "garage_collections_pk" PRIMARY KEY ("user_id", "car_id"),
  CONSTRAINT "garage_collections_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_collections_car_id_fk"
    FOREIGN KEY ("car_id") REFERENCES "public"."garage_cars"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "garage_collections_series_id_fk"
    FOREIGN KEY ("series_id") REFERENCES "public"."garage_series"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "garage_collections_count_check" CHECK ("count" >= 1)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "garage_collections_series_idx" ON "garage_collections" ("series_id", "user_id");--> statement-breakpoint

-- A pull deleted (with its booking, by the pilot reset or Delete forever)
-- takes its copy out of the collection, so the album never shows a card
-- whose record is gone. A customer's own deletion cascades both anyway.
CREATE OR REPLACE FUNCTION "garage_pulls_forget"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "garage_collections"
   WHERE "user_id" = OLD."user_id" AND "car_id" = OLD."car_id" AND "count" <= 1;
  UPDATE "garage_collections" SET "count" = "count" - 1
   WHERE "user_id" = OLD."user_id" AND "car_id" = OLD."car_id";
  RETURN OLD;
END
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS "garage_pulls_forget" ON "garage_pulls";--> statement-breakpoint

CREATE TRIGGER "garage_pulls_forget"
  AFTER DELETE ON "garage_pulls"
  FOR EACH ROW EXECUTE FUNCTION "garage_pulls_forget"();--> statement-breakpoint

-- ─── Rows and the series ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "garage_row_completions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "series_id" uuid NOT NULL,
  "row" smallint NOT NULL,
  "pull_id" uuid,
  "voucher_id" uuid,
  "fallback_stamps" smallint DEFAULT 0 NOT NULL,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_row_completions_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_row_completions_series_id_fk"
    FOREIGN KEY ("series_id") REFERENCES "public"."garage_series"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "garage_row_completions_pull_id_fk"
    FOREIGN KEY ("pull_id") REFERENCES "public"."garage_pulls"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_row_completions_voucher_id_fk"
    FOREIGN KEY ("voucher_id") REFERENCES "public"."reward_vouchers"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_row_completions_row_check" CHECK ("row" BETWEEN 1 AND 8),
  CONSTRAINT "garage_row_completions_fallback_check" CHECK ("fallback_stamps" BETWEEN 0 AND 5)
);--> statement-breakpoint

-- Each row rewarded once per customer.
CREATE UNIQUE INDEX IF NOT EXISTS "garage_row_completions_key"
  ON "garage_row_completions" ("user_id", "series_id", "row");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "garage_row_completions_completed_at_idx" ON "garage_row_completions" ("completed_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "garage_series_completions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "series_id" uuid NOT NULL,
  "pull_id" uuid,
  "badge_award_id" uuid,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_series_completions_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "garage_series_completions_series_id_fk"
    FOREIGN KEY ("series_id") REFERENCES "public"."garage_series"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "garage_series_completions_pull_id_fk"
    FOREIGN KEY ("pull_id") REFERENCES "public"."garage_pulls"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "garage_series_completions_badge_award_id_fk"
    FOREIGN KEY ("badge_award_id") REFERENCES "public"."reward_badge_awards"("id")
    ON DELETE set null ON UPDATE no action
);--> statement-breakpoint

-- A series completed once per customer: the future grand prize's list.
CREATE UNIQUE INDEX IF NOT EXISTS "garage_series_completions_key"
  ON "garage_series_completions" ("user_id", "series_id");--> statement-breakpoint

-- ─── Rewards: the Garage's stamps, vouchers, news, badge, scratch and challenge ─

ALTER TABLE "reward_stamps" ADD COLUMN IF NOT EXISTS "garage_pull_id" uuid;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reward_stamps_garage_pull_id_fk') THEN
    ALTER TABLE "reward_stamps" ADD CONSTRAINT "reward_stamps_garage_pull_id_fk"
      FOREIGN KEY ("garage_pull_id") REFERENCES "public"."garage_pulls"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reward_stamps_garage_pull_idx"
  ON "reward_stamps" ("garage_pull_id") WHERE "source" = 'garage';--> statement-breakpoint
ALTER TABLE "reward_stamps" DROP CONSTRAINT IF EXISTS "reward_stamps_source_check";--> statement-breakpoint
ALTER TABLE "reward_stamps" ADD CONSTRAINT "reward_stamps_source_check"
  CHECK ("source" IN ('booking', 'scratch', 'streak', 'adjustment', 'badge', 'challenge', 'coupon', 'garage'));--> statement-breakpoint
ALTER TABLE "reward_stamps" DROP CONSTRAINT IF EXISTS "reward_stamps_source_fields_check";--> statement-breakpoint
ALTER TABLE "reward_stamps" ADD CONSTRAINT "reward_stamps_source_fields_check" CHECK (
  ("source" = 'booking') = ("booking_id" IS NOT NULL)
  AND ("source" = 'scratch') = ("scratch_card_id" IS NOT NULL)
  AND ("source" = 'streak') = ("streak_month" IS NOT NULL)
  AND ("source" = 'badge') = ("badge_award_id" IS NOT NULL)
  AND ("source" = 'challenge') = ("challenge_id" IS NOT NULL)
  AND ("source" = 'coupon') = ("coupon_redemption_id" IS NOT NULL)
  AND ("source" = 'garage') = ("garage_pull_id" IS NOT NULL)
  AND ("source" <> 'adjustment' OR ("reason" IS NOT NULL AND "actor_name" IS NOT NULL))
);--> statement-breakpoint

ALTER TABLE "reward_vouchers" DROP CONSTRAINT IF EXISTS "reward_vouchers_kind_check";--> statement-breakpoint
ALTER TABLE "reward_vouchers" ADD CONSTRAINT "reward_vouchers_kind_check" CHECK (
  "kind" IN ('shine', 'scratch', 'free_wash', 'referral', 'birthday', 'annual_detailing', 'adjustment', 'challenge', 'garage_row')
);--> statement-breakpoint

ALTER TABLE "reward_nudges" DROP CONSTRAINT IF EXISTS "reward_nudges_kind_check";--> statement-breakpoint
ALTER TABLE "reward_nudges" ADD CONSTRAINT "reward_nudges_kind_check" CHECK (
  "kind" IN (
    'expiring', 'one_away', 'wash_due', 'badge', 'challenge_start', 'challenge_one_left', 'challenge_won', 'wrapped',
    'garage_card', 'garage_row', 'garage_series'
  )
);--> statement-breakpoint

ALTER TABLE "reward_badge_awards" DROP CONSTRAINT IF EXISTS "reward_badge_awards_key_check";--> statement-breakpoint
ALTER TABLE "reward_badge_awards" ADD CONSTRAINT "reward_badge_awards_key_check" CHECK (
  "badge_key" IN (
    'first_shine', 'washes_5', 'washes_25', 'washes_50', 'washes_100',
    'streak_3', 'streak_6', 'streak_12', 'monsoon_shine', 'early_bird', 'night_owl',
    'explorer', 'loyal_regular', 'pickup_pro', 'doorstep_devotee', 'reviewer',
    'ambassador', 'detailing_devotee', 'coating_club', 'challenge', 'garage_legend'
  )
);--> statement-breakpoint

-- A scratch card can be a Garage card: drawn with the Garage's own chance,
-- no amount; past the switch it falls back to a bonus stamp when scratched.
ALTER TABLE "reward_scratch_cards" DROP CONSTRAINT IF EXISTS "reward_scratch_cards_outcome_check";--> statement-breakpoint
ALTER TABLE "reward_scratch_cards" ADD CONSTRAINT "reward_scratch_cards_outcome_check" CHECK (
  "outcome" IN ('small_off', 'medium_off', 'big_off', 'bonus_stamp', 'free_wash', 'garage_card')
  AND "drawn_outcome" IN ('small_off', 'medium_off', 'big_off', 'bonus_stamp', 'free_wash', 'garage_card')
);--> statement-breakpoint
ALTER TABLE "reward_scratch_cards" DROP CONSTRAINT IF EXISTS "reward_scratch_cards_prize_check";--> statement-breakpoint
ALTER TABLE "reward_scratch_cards" ADD CONSTRAINT "reward_scratch_cards_prize_check"
  CHECK (("outcome" IN ('bonus_stamp', 'garage_card')) = ("prize_amount" IS NULL));--> statement-breakpoint

-- A challenge can win Garage cards (1–5).
ALTER TABLE "reward_challenges" ADD COLUMN IF NOT EXISTS "reward_cards" smallint;--> statement-breakpoint
ALTER TABLE "reward_challenges" DROP CONSTRAINT IF EXISTS "reward_challenges_reward_check";--> statement-breakpoint
ALTER TABLE "reward_challenges" ADD CONSTRAINT "reward_challenges_reward_check" CHECK (
  "reward_kind" IN ('stamps', 'voucher', 'multiplier', 'badge', 'garage_cards')
  AND ("reward_kind" = 'stamps') = ("reward_stamps" IS NOT NULL)
  AND ("reward_kind" = 'voucher') = ("reward_amount" IS NOT NULL)
  AND ("reward_kind" = 'multiplier') = ("reward_multiplier" IS NOT NULL)
  AND ("reward_kind" = 'garage_cards') = ("reward_cards" IS NOT NULL)
  AND ("reward_stamps" IS NULL OR "reward_stamps" BETWEEN 1 AND 10)
  AND ("reward_amount" IS NULL OR ("reward_amount" > 0 AND "reward_amount" <= 2000))
  AND ("reward_multiplier" IS NULL OR "reward_multiplier" BETWEEN 2 AND 3)
  AND ("reward_cards" IS NULL OR "reward_cards" BETWEEN 1 AND 5)
  -- A ₹ prize always has a cap on winners: the budget's worst case.
  AND ("reward_kind" <> 'voucher' OR "max_winners" IS NOT NULL)
);--> statement-breakpoint

-- ─── Series 1: 40 fictional hypercars ────────────────────────────────────────
-- Invented names only (garage-series.test.ts runs a deny-list of real makes
-- and models over every name and line, and holds these rows to the list in
-- lib/garage-series.ts). Edited by the team in admin afterwards.

INSERT INTO "garage_series" ("id", "number", "name", "status", "updated_by")
VALUES ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 1, 'Series 1', 'live', 'Detlio (0057)')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "garage_cars" ("series_id", "number", "name", "rarity", "tone", "paint", "colour", "stats", "lore")
VALUES
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 1, 'Marina Drift', 'common', 'light', '#6FAFA6', 'Sea Glass',
   ARRAY['0–100: 3.9 s', 'Top speed: 298 km/h', 'Colour: Sea Glass'], 'Built for slow evening laps along the beach road, windows down.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 2, 'Chai Racer', 'common', 'light', '#6E8B4E', 'Cardamom Green',
   ARRAY['0–100: 4.1 s', 'Top speed: 286 km/h', 'Colour: Cardamom Green'], 'Never misses the four o’clock chai stop, however late the meeting runs.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 3, 'Saffron Arrow', 'rare', 'dark', '#F29A1F', 'Festival Saffron',
   ARRAY['0–100: 3.2 s', 'Top speed: 322 km/h', 'Colour: Festival Saffron'], 'Painted the shade of a festival sky at dusk.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 4, 'Copper Kite', 'common', 'light', '#B8693D', 'Burnished Copper',
   ARRAY['0–100: 3.8 s', 'Top speed: 301 km/h', 'Colour: Burnished Copper'], 'Light as a paper kite, and just as hard to catch on a windy day.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 5, 'Crimson Talon', 'epic', 'dark', '#A3172B', 'Temple Crimson',
   ARRAY['0–100: 2.6 s', 'Top speed: 352 km/h', 'Colour: Temple Crimson'], 'Its headlights narrow like a hawk’s eyes at every green light.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 6, 'Coastal Glide', 'common', 'light', '#3B6FA8', 'Bay Blue',
   ARRAY['0–100: 3.7 s', 'Top speed: 304 km/h', 'Colour: Bay Blue'], 'Tuned on the coast road, one sea breeze at a time.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 7, 'Monsoon GT', 'rare', 'dark', '#0F7A78', 'Monsoon Teal',
   ARRAY['0–100: 3.1 s', 'Top speed: 326 km/h', 'Colour: Monsoon Teal'], 'Loves the first rain of June more than anyone in the city.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 8, 'Pebble Hopper', 'common', 'light', '#8E918C', 'River Pebble',
   ARRAY['0–100: 4.2 s', 'Top speed: 280 km/h', 'Colour: River Pebble'], 'Small, round and cheerful, like a stone skipping across a lake.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 9, 'Neem Flicker', 'common', 'light', '#4E8A3A', 'Neem Green',
   ARRAY['0–100: 3.9 s', 'Top speed: 292 km/h', 'Colour: Neem Green'], 'Parks in the shade of the same neem tree every afternoon.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 10, 'Kaveri Surge', 'rare', 'dark', '#566C7E', 'River Slate',
   ARRAY['0–100: 3.0 s', 'Top speed: 331 km/h', 'Colour: River Slate'], 'Named after the river, and just as hard to hold back.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 11, 'Harbour Flash', 'common', 'light', '#4F5965', 'Harbour Grey',
   ARRAY['0–100: 3.6 s', 'Top speed: 306 km/h', 'Colour: Harbour Grey'], 'Gone before the ferry horn has finished sounding.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 12, 'Mango Zing', 'common', 'dark', '#F2B705', 'Alphonso Yellow',
   ARRAY['0–100: 3.8 s', 'Top speed: 296 km/h', 'Colour: Alphonso Yellow'], 'The colour of the first mango of summer.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 13, 'Peacock Blade', 'rare', 'dark', '#0B6FA4', 'Peacock Blue',
   ARRAY['0–100: 3.1 s', 'Top speed: 328 km/h', 'Colour: Peacock Blue'], 'Shows off its colours whenever it rains.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 14, 'Kanjeevaram Silk', 'epic', 'dark', '#8E1F5C', 'Silk Magenta',
   ARRAY['0–100: 2.5 s', 'Top speed: 348 km/h', 'Colour: Silk Magenta'], 'Woven like a wedding saree: every panel has a shine of its own.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 15, 'Kolam Swirl', 'common', 'dark', '#ECE7DC', 'Rice Flour White',
   ARRAY['0–100: 4.0 s', 'Top speed: 289 km/h', 'Colour: Rice Flour White'], 'Leaves a neat pattern of tyre tracks at every sunrise.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 16, 'Ghat Road Rally', 'rare', 'light', '#5E7F6B', 'Eucalyptus',
   ARRAY['0–100: 3.3 s', 'Top speed: 318 km/h', 'Colour: Eucalyptus'], 'Counts hairpin bends the way others count sheep.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 17, 'Filter Coffee GT', 'common', 'light', '#5A3A26', 'Decoction Brown',
   ARRAY['0–100: 3.9 s', 'Top speed: 294 km/h', 'Colour: Decoction Brown'], 'Strong, smooth and best enjoyed early in the morning.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 18, 'Jasmine Glint', 'common', 'dark', '#F3EFE4', 'Jasmine White',
   ARRAY['0–100: 4.1 s', 'Top speed: 284 km/h', 'Colour: Jasmine White'], 'Smells faintly of jasmine, and nobody knows why.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 19, 'Coromandel Flyer', 'rare', 'dark', '#13A3A0', 'Coast Turquoise',
   ARRAY['0–100: 3.0 s', 'Top speed: 333 km/h', 'Colour: Coast Turquoise'], 'Races the sunrise up the coast, and usually wins.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 20, 'Chola Thunder', 'legendary', 'dark', '#B07A2A', 'Temple Bronze',
   ARRAY['0–100: 2.1 s', 'Top speed: 404 km/h', 'Colour: Temple Bronze'], 'Carved like a temple chariot, built to cross an empire in an afternoon.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 21, 'Rangoli Twist', 'common', 'light', '#D9507F', 'Rangoli Pink',
   ARRAY['0–100: 3.8 s', 'Top speed: 297 km/h', 'Colour: Rangoli Pink'], 'Comes alive at Diwali, like every doorstep in town.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 22, 'Teal Tide', 'common', 'light', '#2A9D8F', 'Lagoon Teal',
   ARRAY['0–100: 3.7 s', 'Top speed: 302 km/h', 'Colour: Lagoon Teal'], 'Arrives quietly, then suddenly it is everywhere, like the evening tide.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 23, 'Midnight Current', 'rare', 'light', '#1B2A5C', 'Midnight Blue',
   ARRAY['0–100: 3.1 s', 'Top speed: 329 km/h', 'Colour: Midnight Blue'], 'Hums along empty flyovers long after the city sleeps.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 24, 'Silver Sparrow', 'common', 'dark', '#B7BCC4', 'Sparrow Silver',
   ARRAY['0–100: 4.0 s', 'Top speed: 288 km/h', 'Colour: Sparrow Silver'], 'Small, quick and never far from home.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 25, 'Solar Flare', 'epic', 'dark', '#FF5A1F', 'Flare Orange',
   ARRAY['0–100: 2.7 s', 'Top speed: 356 km/h', 'Colour: Flare Orange'], 'So bright that the parking attendant reaches for sunglasses.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 26, 'Banyan Loop', 'common', 'light', '#6B6B3A', 'Banyan Olive',
   ARRAY['0–100: 4.0 s', 'Top speed: 287 km/h', 'Colour: Banyan Olive'], 'Takes the long way round, under every banyan it can find.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 27, 'Emerald Parakeet', 'rare', 'dark', '#1E9E55', 'Parakeet Green',
   ARRAY['0–100: 3.2 s', 'Top speed: 321 km/h', 'Colour: Parakeet Green'], 'A chatty exhaust and a bright green coat: impossible to ignore.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 28, 'Gulmohar Ember', 'common', 'light', '#C8402A', 'Gulmohar Red',
   ARRAY['0–100: 3.6 s', 'Top speed: 305 km/h', 'Colour: Gulmohar Red'], 'Blooms red every May, right on time.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 29, 'Nilgiri Mist', 'rare', 'light', '#7F97AA', 'Hill Mist Blue',
   ARRAY['0–100: 3.3 s', 'Top speed: 316 km/h', 'Colour: Hill Mist Blue'], 'Climbs into the clouds and comes back smelling of tea leaves.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 30, 'Obsidian Halo', 'epic', 'dark', '#17181D', 'Obsidian Black',
   ARRAY['0–100: 2.4 s', 'Top speed: 361 km/h', 'Colour: Obsidian Black'], 'Seen only as a glow of headlights on a moonless night.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 31, 'Pearl Bay Skimmer', 'common', 'dark', '#E6E9EC', 'Pearl White',
   ARRAY['0–100: 3.9 s', 'Top speed: 293 km/h', 'Colour: Pearl White'], 'Skims the coast road like a stone across still water.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 32, 'Tamarind Zip', 'common', 'light', '#7A4B2A', 'Tamarind Brown',
   ARRAY['0–100: 3.7 s', 'Top speed: 299 km/h', 'Colour: Tamarind Brown'], 'A little sour, a little sweet, very quick off the line.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 33, 'Indigo Rapids', 'rare', 'dark', '#3A2E9C', 'Deep Indigo',
   ARRAY['0–100: 3.0 s', 'Top speed: 334 km/h', 'Colour: Deep Indigo'], 'White-water quick, deep-indigo calm.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 34, 'Sandstone Roamer', 'common', 'dark', '#C8A77E', 'Desert Sandstone',
   ARRAY['0–100: 4.1 s', 'Top speed: 285 km/h', 'Colour: Desert Sandstone'], 'Has seen every hill fort in the state, twice.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 35, 'Electric Firefly', 'epic', 'dark', '#A8D42A', 'Firefly Lime',
   ARRAY['0–100: 2.6 s', 'Top speed: 350 km/h', 'Colour: Firefly Lime'], 'Glows a little brighter every time the power goes out.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 36, 'Rubyline', 'rare', 'light', '#9B111E', 'Ruby Red',
   ARRAY['0–100: 3.1 s', 'Top speed: 327 km/h', 'Colour: Ruby Red'], 'Cut like a gemstone, with a red streak where its shadow should be.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 37, 'Moonlit Ferry', 'common', 'dark', '#A9B0BA', 'Moonstone Grey',
   ARRAY['0–100: 3.8 s', 'Top speed: 295 km/h', 'Colour: Moonstone Grey'], 'Crosses town as calmly as the last ferry home.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 38, 'Himalayan Glacier', 'epic', 'dark', '#9FD3E6', 'Glacier Blue',
   ARRAY['0–100: 2.5 s', 'Top speed: 358 km/h', 'Colour: Glacier Blue'], 'Cool under pressure, even in a Chennai May.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 39, 'Marina Nightfall', 'rare', 'light', '#4B2A5C', 'Dusk Purple',
   ARRAY['0–100: 3.2 s', 'Top speed: 324 km/h', 'Colour: Dusk Purple'], 'Shows up just as the street lights come on along the beach.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 40, 'Celestial Vimana', 'legendary', 'dark', '#D4AF37', 'Celestial Gold',
   ARRAY['0–100: 1.9 s', 'Top speed: 418 km/h', 'Colour: Celestial Gold'], 'Said to have flown once, long ago. Nobody has proved otherwise.')
ON CONFLICT ("series_id", "number") DO NOTHING;
