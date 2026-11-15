-- Car condition check at handover (modules/condition-check; screens OK'd by
-- the owner, mockup ai-round/3-condition-check). A guided 8-angle walk-round
-- when the garage takes the car: Detlio's AI marks the scratches and dents
-- already there, the garage removes a wrong mark (or adds one it missed) and
-- sends it, and the customer says "Looks right" or "Something's wrong". After
-- the job the same angles are compared with the before photos; a possible new
-- mark warns the garage and is shown to the customer. Nothing blames anyone.
--
--   job_photos.angle          four more angles: front_left, front_right,
--                             back_left, back_right (the CHECK is widened)
--   job_photos.condition_read whether Detlio's AI has looked at the photo
--                             (done / failed), and when
--   condition_checks          one per booking: when the garage sent the
--                             before check, and the customer's answer
--   condition_marks           each mark on a photo: what, where (a box in
--                             0-1 coordinates), Detlio's or the garage's,
--                             removed (kept for the record), and the answers
--                             to a possible new mark after the job
--
-- Purely additive: today's API never reads these, and every value it writes
-- still passes the widened CHECK, so it is safe to apply before the code that
-- uses it is deployed (the code is also behind CONDITION_CHECK_ENABLED=on).
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- safe to re-run.

-- ─── Job photos ──────────────────────────────────────────────────────────────

ALTER TABLE "job_photos"
  DROP CONSTRAINT IF EXISTS "job_photos_angle_check";--> statement-breakpoint
ALTER TABLE "job_photos"
  ADD CONSTRAINT "job_photos_angle_check" CHECK ("angle" IS NULL OR "angle" IN (
    'front', 'back', 'left', 'right', 'interior',
    'front_left', 'front_right', 'back_left', 'back_right'
  ));--> statement-breakpoint

ALTER TABLE "job_photos" ADD COLUMN IF NOT EXISTS "condition_read" text;--> statement-breakpoint
ALTER TABLE "job_photos" ADD COLUMN IF NOT EXISTS "condition_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_photos"
  DROP CONSTRAINT IF EXISTS "job_photos_condition_read_check";--> statement-breakpoint
ALTER TABLE "job_photos"
  ADD CONSTRAINT "job_photos_condition_read_check" CHECK (
    ("condition_read" IS NULL AND "condition_read_at" IS NULL)
    OR ("condition_read" IN ('done', 'failed') AND "condition_read_at" IS NOT NULL)
  );--> statement-breakpoint

-- ─── The check: sent, and the customer's answer ──────────────────────────────

CREATE TABLE IF NOT EXISTS "condition_checks" (
  "booking_id" uuid PRIMARY KEY NOT NULL,
  "sent_at" timestamp with time zone NOT NULL,
  "sent_by" uuid,
  -- 'looks_right' or 'something_wrong'; the person is the booking's customer.
  "customer_answer" text,
  "customer_answered_at" timestamp with time zone,
  "customer_answered_by" uuid,
  -- "Something's wrong": what the customer says, for the garage and the team.
  "customer_note" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "condition_checks_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "condition_checks_sent_by_users_id_fk"
    FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "condition_checks_customer_answered_by_users_id_fk"
    FOREIGN KEY ("customer_answered_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "condition_checks_answer_check" CHECK (
    ("customer_answer" IS NULL AND "customer_answered_at" IS NULL AND "customer_note" IS NULL)
    OR ("customer_answer" = 'looks_right' AND "customer_answered_at" IS NOT NULL AND "customer_note" IS NULL)
    OR ("customer_answer" = 'something_wrong' AND "customer_answered_at" IS NOT NULL
        AND "customer_note" IS NOT NULL AND char_length(btrim("customer_note")) > 0)
  )
);--> statement-breakpoint

-- ─── The marks ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "condition_marks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "photo_id" uuid NOT NULL,
  -- After marks: the before photo of the same angle it was compared with.
  "compared_photo_id" uuid,
  "stage" text NOT NULL,
  "kind" text NOT NULL,
  -- Where on the car, in a few words ("rear left door"); never a plate.
  "part" varchar(60) NOT NULL,
  -- A box on the photo, 0-1 from the top left; all four or none (a mark the
  -- garage added has none).
  "box_x" real,
  "box_y" real,
  "box_w" real,
  "box_h" real,
  "source" text NOT NULL,
  -- Detlio was not sure about it.
  "unsure" boolean DEFAULT false NOT NULL,
  -- The garage removed it as wrong (before the check was sent). Kept.
  "removed_at" timestamp with time zone,
  -- A possible new mark after the job: the garage says "It was there", the
  -- customer "It was already there".
  "garage_answer" text,
  "garage_answered_at" timestamp with time zone,
  "customer_answer" text,
  "customer_answered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "condition_marks_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "condition_marks_photo_id_job_photos_id_fk"
    FOREIGN KEY ("photo_id") REFERENCES "public"."job_photos"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "condition_marks_compared_photo_id_job_photos_id_fk"
    FOREIGN KEY ("compared_photo_id") REFERENCES "public"."job_photos"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "condition_marks_stage_check" CHECK ("stage" IN ('before', 'after')),
  CONSTRAINT "condition_marks_kind_check"
    CHECK ("kind" IN ('scratch', 'dent', 'crack', 'paint_chip', 'other')),
  CONSTRAINT "condition_marks_source_check" CHECK ("source" IN ('ai', 'garage')),
  CONSTRAINT "condition_marks_part_check" CHECK (char_length(btrim("part")) BETWEEN 1 AND 60),
  CONSTRAINT "condition_marks_box_check" CHECK (
    ("box_x" IS NULL AND "box_y" IS NULL AND "box_w" IS NULL AND "box_h" IS NULL)
    OR ("box_x" BETWEEN 0 AND 1 AND "box_y" BETWEEN 0 AND 1
        AND "box_w" > 0 AND "box_w" <= 1 AND "box_h" > 0 AND "box_h" <= 1)
  ),
  CONSTRAINT "condition_marks_garage_answer_check" CHECK (
    ("garage_answer" IS NULL AND "garage_answered_at" IS NULL)
    OR ("garage_answer" = 'was_there' AND "garage_answered_at" IS NOT NULL AND "stage" = 'after')
  ),
  CONSTRAINT "condition_marks_customer_answer_check" CHECK (
    ("customer_answer" IS NULL AND "customer_answered_at" IS NULL)
    OR ("customer_answer" = 'already_there' AND "customer_answered_at" IS NOT NULL AND "stage" = 'after')
  )
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "condition_marks_booking_idx"
  ON "condition_marks" ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "condition_marks_photo_idx"
  ON "condition_marks" ("photo_id");
