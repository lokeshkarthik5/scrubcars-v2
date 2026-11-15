-- Shine Score (modules/shine-score; screens OK'd 15 Nov 2026): a free
-- cleanliness score from four photos, and a before/after score from a
-- finished job's garage photos, behind SHINE_SCORE_ENABLED=on.
--
--   shine_scans        a customer's scans: when, how it went, the scores and
--                      what was noticed, and the private photos' keys. The
--                      whole row and its photos are deleted after 30 days
--                      (the pending-digest cron). Tells the day's free scans.
--   shine_job_scores   one per finished booking: the before and after scores
--                      of the areas both sets of garage photos show, and, for
--                      an after-score under 60, where the team's look at it
--                      stands (Admin -> Issues -> Shine checks). Nothing ever
--                      reads it to mark down, strike or pause a garage.
--
-- Purely additive: today's API never reads these, so it is safe to apply
-- before the code that uses it is deployed. Applied by scripts/migrate.sh, one
-- transaction per file. Every statement is safe to re-run.

CREATE TABLE IF NOT EXISTS "shine_scans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- SET NULL, not cascade: a deleted account's scan photos are still
  -- deleted by the 30-day sweep, which finds them through this row.
  "user_id" uuid,
  "ist_day" date NOT NULL,
  "status" text DEFAULT 'scoring' NOT NULL,
  "overall" smallint,
  "scores" jsonb,
  "findings" jsonb,
  "summary" varchar(160),
  "suggestion" varchar(160),
  "photo_keys" text[] DEFAULT '{}'::text[] NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "scored_at" timestamp with time zone,
  CONSTRAINT "shine_scans_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "shine_scans_status_check" CHECK ("status" IN ('scoring', 'scored', 'failed')),
  CONSTRAINT "shine_scans_overall_check" CHECK ("overall" IS NULL OR "overall" BETWEEN 0 AND 100),
  CONSTRAINT "shine_scans_scored_check" CHECK (
    ("status" = 'scored') = ("overall" IS NOT NULL AND "scores" IS NOT NULL AND "scored_at" IS NOT NULL)
  )
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "shine_scans_user_day_idx"
  ON "shine_scans" ("user_id", "ist_day");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "shine_scans_created_at_idx"
  ON "shine_scans" ("created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "shine_job_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "vendor_id" uuid,
  "status" text DEFAULT 'scoring' NOT NULL,
  "attempts" smallint DEFAULT 1 NOT NULL,
  "areas" text[] DEFAULT '{}'::text[] NOT NULL,
  "before_overall" smallint,
  "after_overall" smallint,
  "before_scores" jsonb,
  "after_scores" jsonb,
  "findings" jsonb,
  "review_status" text,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" varchar(100),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "scored_at" timestamp with time zone,
  CONSTRAINT "shine_job_scores_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "shine_job_scores_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "shine_job_scores_booking_id_unique" UNIQUE ("booking_id"),
  CONSTRAINT "shine_job_scores_status_check" CHECK ("status" IN ('scoring', 'scored', 'no_match', 'failed')),
  CONSTRAINT "shine_job_scores_overall_check" CHECK (
    ("before_overall" IS NULL OR "before_overall" BETWEEN 0 AND 100)
    AND ("after_overall" IS NULL OR "after_overall" BETWEEN 0 AND 100)
  ),
  CONSTRAINT "shine_job_scores_scored_check" CHECK (
    ("status" = 'scored') = ("before_overall" IS NOT NULL AND "after_overall" IS NOT NULL AND "scored_at" IS NOT NULL)
  ),
  CONSTRAINT "shine_job_scores_review_status_check" CHECK (
    "review_status" IS NULL OR "review_status" IN ('new', 'looks_fine', 'followed_up')
  ),
  CONSTRAINT "shine_job_scores_reviewed_check" CHECK (
    ("review_status" IN ('looks_fine', 'followed_up')) = ("reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)
    OR "review_status" IS NULL
  )
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "shine_job_scores_review_idx"
  ON "shine_job_scores" ("review_status", "scored_at")
  WHERE "review_status" IS NOT NULL;
