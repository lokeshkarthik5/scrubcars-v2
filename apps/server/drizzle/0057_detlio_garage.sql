-- The Detlio Garage: a collectible series of supercar photo cards
-- customers earn by booking through Detlio (owner, 18–19 Oct 2026). Rules in
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
--   - `garage_cars`: its cars, numbered 1–40 (rows of five by number): an
--     invented series name, rarity, the card's photo by its id in the card
--     photo pool (the licensed photos the premium cards use; never a URL),
--     the photo's colour and setting, a one-line story, on/off, and an
--     uploaded picture (a public R2 URL under garage/series-<n>/) when the
--     team gives a future series its own art. Series 1's 40 cars are seeded
--     (20 Common, 12 Rare, 6 Epic, 2 Legendary).
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
  "photo_id" varchar(60) NOT NULL,
  "colour" varchar(24) NOT NULL,
  "setting" varchar(24) NOT NULL,
  "lore" varchar(110) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "art_source" text DEFAULT 'photo' NOT NULL,
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
  -- The card photo pool's id (packages/core/src/card-cars.ts): never a URL.
  CONSTRAINT "garage_cars_photo_id_check" CHECK ("photo_id" ~ '^[a-z0-9-]{2,60}$'),
  CONSTRAINT "garage_cars_art_source_check" CHECK ("art_source" IN ('photo', 'upload')),
  -- The pool photo has no URL here; an uploaded picture always does.
  CONSTRAINT "garage_cars_art_url_check" CHECK (("art_source" = 'upload') = ("art_url" IS NOT NULL))
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

-- ─── Series 1: 40 cards ─────────────────────────────────────────────────────
-- Each a licensed card photo by id. Names never hint at a maker or model
-- (garage-series.test.ts runs a deny-list of real makes and models over every
-- word, and holds these rows to the list in lib/garage-series.ts). Edited by
-- the team in admin afterwards.

INSERT INTO "garage_series" ("id", "number", "name", "status", "updated_by")
VALUES ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 1, 'Series 1', 'live', 'Detlio (0057)')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "garage_cars" ("series_id", "number", "name", "rarity", "photo_id", "colour", "setting", "lore")
VALUES
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 1, 'Gulmohar Ember', 'common', 'red-rear', 'Red', 'Rain',
   'Glows like a gulmohar in full bloom, even under a June shower.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 2, 'Coastal Glide', 'common', 'blue-coupe-white-studio', 'Sky blue', 'Studio',
   'Sky blue, like the sea on a still morning.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 3, 'Saffron Arrow', 'rare', 'orange-coupe-side', 'Orange', 'Studio',
   'Painted the shade of a festival sky at dusk.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 4, 'Neem Flicker', 'common', 'green-coupe-front', 'Green', 'Studio',
   'Cool and green, like the shade of a neem tree at noon.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 5, 'Crimson Talon', 'epic', 'red-supercar-studio', 'Red', 'Dark studio',
   'Sharp lines, deep red, and a studio light that never quite lets go.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 6, 'Kolam Swirl', 'common', 'white-supercar-front', 'White', 'Studio',
   'As crisp as a kolam drawn at sunrise.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 7, 'Rangoli Twist', 'common', 'purple-coupe-open-lot', 'Purple', 'Park',
   'Comes alive at Diwali, like every doorstep in town.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 8, 'Peacock Blade', 'rare', 'blue-coupe-rear', 'Deep blue', 'Countryside',
   'Shows off its colours whenever the sun comes out.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 9, 'Mango Zing', 'common', 'yellow-coupe-stripes', 'Yellow and black', 'City',
   'The colour of the first mango of summer, with a stripe of shade.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 10, 'Midnight Current', 'epic', 'blue-supercar-outline', 'Blue', 'Dark studio',
   'Drawn in a single line of light, like the city after midnight.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 11, 'Silver Sparrow', 'common', 'silver-roadster-front', 'Silver', 'Studio',
   'Small, bright and never far from home.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 12, 'Jacaranda Dusk', 'rare', 'purple-coupe-dusk', 'Purple', 'Dusk',
   'Purple as a jacaranda in bloom, just as the street lights come on.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 13, 'Banyan Loop', 'common', 'green-coupe-rooftop', 'Green', 'Rooftop',
   'Takes the long way round, under every banyan it can find.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 14, 'Kajal Edge', 'rare', 'black-widebody-front', 'Black', 'Studio',
   'Black as kajal, with a sharp line at every edge.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 15, 'Kasavu Drift', 'common', 'white-gold-coupe', 'White and gold', 'Park',
   'White with a gold border, like a kasavu saree on Onam.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 16, 'Ghat Road Rally', 'common', 'green-racer', 'Racing green', 'Studio',
   'Made for hairpin bends and the smell of eucalyptus.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 17, 'Filter Coffee GT', 'common', 'black-coupe-rooftop', 'Black', 'Rooftop',
   'Strong, dark and best enjoyed early in the morning.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 18, 'Marigold Flare', 'rare', 'orange-supercar-close', 'Orange', 'Close up',
   'Bright as a marigold garland, and just as hard to miss.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 19, 'Chola Thunder', 'rare', 'bronze-coupe-side', 'Bronze', 'Studio',
   'Bronze like a temple bell, and just as hard to ignore.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 20, 'Crimson Reverie', 'legendary', 'red-concept-reflection', 'Red', 'Mirror floor',
   'So red that even its reflection looks like a dream.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 21, 'Marina Drift', 'common', 'blue-coupe-grey-street', 'Blue', 'Street',
   'Built for slow evening drives along the beach road, windows down.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 22, 'Jasmine Glint', 'common', 'white-coupe-side', 'White', 'Studio',
   'Soft white, like a string of jasmine on a summer evening.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 23, 'Jamun Blur', 'rare', 'purple-hypercar', 'Purple', 'Track',
   'The colour of ripe jamun, gone in a purple blur.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 24, 'Pearl Bay Skimmer', 'common', 'white-supercar-dark', 'White', 'Dark studio',
   'Pearl white against the dark, like a lamp by the sea.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 25, 'Emerald Canopy', 'epic', 'green-coupe-from-above', 'Green', 'From above',
   'Seen from above, it shines like the canopy after the first rain.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 26, 'Chrome Kite', 'common', 'silver-concept', 'Silver', 'Studio',
   'Silver curves, drawn as if with a single stroke.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 27, 'Lavender Kite', 'common', 'lavender-coupe-head-on', 'Lavender', 'Park',
   'Soft lavender, light as a kite on a still afternoon.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 28, 'Nilgiri Mist', 'rare', 'green-grey-concept', 'Dark green', 'Studio',
   'Climbs into the clouds and comes back smelling of tea leaves.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 29, 'Harbour Flash', 'common', 'grey-coupe', 'Matte grey', 'City',
   'Harbour grey with a flash of yellow, parked where the ferries turn.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 30, 'Obsidian Halo', 'epic', 'black-coupe-blue-light', 'Black', 'Blue light',
   'Black as obsidian, lit by a halo of blue.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 31, 'Electric Firefly', 'rare', 'yellow-coupe-street', 'Yellow', 'Night street',
   'Glows a little brighter every time the street lights go out.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 32, 'Moonlit Marina', 'rare', 'silver-coupe-black', 'Silver', 'Night',
   'Silver under the moon, with the beach road all to itself.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 33, 'Moonlit Ferry', 'common', 'white-roadster-garage', 'White', 'Garage',
   'Waits in the dark as calmly as the last ferry home.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 34, 'Kaveri Surge', 'common', 'silver-supercar-close', 'Silver', 'Grey studio',
   'River grey, and just as calm before it moves.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 35, 'Saffron Dusk', 'epic', 'silver-hypercar-light', 'Silver', 'Studio light',
   'Silver caught in the last saffron light of the day.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 36, 'Kolam Wing', 'rare', 'white-wing-rear', 'White and red', 'Garage',
   'A wing as bold as a festival kolam, on a chequered floor.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 37, 'Monsoon Plum', 'common', 'purple-coupe-overcast', 'Purple', 'Overcast',
   'Deep plum under grey skies, the colour of a monsoon evening.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 38, 'Marina Nightfall', 'rare', 'white-track-rear', 'White', 'Night studio',
   'Shows up just as the lights turn violet along the beach.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 39, 'Neelam Night', 'epic', 'blue-classic-coupe', 'Dark blue', 'Dark studio',
   'Deep sapphire blue, polished for a night that never ends.'),
  ('5e1d0c4a-2b7e-4f39-9c1d-0057d1a10001', 40, 'Celestial Vimana', 'legendary', 'white-concept-top', 'White', 'Black studio',
   'Said to have flown once, long ago. Nobody has proved otherwise.')
ON CONFLICT ("series_id", "number") DO NOTHING;
