-- Detlio Certified: a quality badge a garage earns by meeting measurable
-- standards and passing an in-person check by Detlio.
--
-- Idea #30 (owner, 18 Oct 2026). The standards (lib/certification.ts,
-- CERTIFICATION_RULES) are measured from rows that already exist: documents
-- (0043), reviews, completed bookings, the response deadline (0042),
-- complaints (0035) and no-shows. This migration adds only what Detlio
-- records and decides:
--
--   - `vendor_quality_checks`: each mystery visit or inspection Detlio made:
--     the IST date of the visit, the checker's name, pass or fail, notes
--     (required on a fail), and the admin who recorded it. A pass in the last
--     6 months, with no later fail, is needed to certify. Never shown to
--     customers; the garage sees only whether and when it passed.
--   - `vendor_certifications`: one row per garage that has been evaluated or
--     certified. `certified_at`/`certified_by` (the admin's typed name) when
--     an admin pressed Certify; `revoked_at`/`revoked_by`/`revoked_reason`/
--     `revoke_kind` when it ended (`revoked` by an admin, `lapsed` after 14
--     days short). Certified = `certified_at IS NOT NULL AND revoked_at IS
--     NULL`; Certify again clears the revocation. `eligible`, `eligibility`
--     (a JSON snapshot of the checklist) and `last_evaluated_at` are the last
--     evaluation, for the admin list; `ineligible_since` starts the 14 days;
--     `eligible_alerted_at` keeps "became eligible" from posting every night.
--     The history of grants and revocations is in admin_audit_log.
--
-- Both cascade with the garage. A tombstone (Delete forever with money kept)
-- deletes them in the API. The test-data reset never touches them.
--
-- Purely additive: two new tables that today's API never reads, so it is
-- safe to apply before the code that uses it is deployed. Numbered 0048:
-- 0045–0047 belong to branches built in parallel (job photo standards, car
-- history, slot alerts); the migrations lint reports the gap until they are
-- merged.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

CREATE TABLE IF NOT EXISTS "vendor_quality_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  -- The IST date of the visit.
  "checked_on" date NOT NULL,
  "kind" text NOT NULL,
  "checker_name" varchar(100) NOT NULL,
  "result" text NOT NULL,
  "notes" varchar(1000),
  -- The admin's typed name, as the Bin records it; the session in *_sub.
  "recorded_by" varchar(100) NOT NULL,
  "recorded_by_sub" varchar(100) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendor_quality_checks_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "vendor_quality_checks_kind_check" CHECK ("kind" IN ('mystery_visit', 'inspection')),
  CONSTRAINT "vendor_quality_checks_result_check" CHECK ("result" IN ('pass', 'fail')),
  CONSTRAINT "vendor_quality_checks_checker_name_check" CHECK (char_length(btrim("checker_name")) > 0),
  CONSTRAINT "vendor_quality_checks_recorded_by_check" CHECK (char_length(btrim("recorded_by")) > 0),
  -- A fail always says what was wrong.
  CONSTRAINT "vendor_quality_checks_fail_notes_check" CHECK (
    "result" = 'pass' OR ("notes" IS NOT NULL AND char_length(btrim("notes")) > 0)
  )
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vendor_quality_checks_vendor_id_checked_on_idx"
  ON "vendor_quality_checks" ("vendor_id", "checked_on" DESC);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vendor_certifications" (
  "vendor_id" uuid PRIMARY KEY NOT NULL,
  "certified_at" timestamp with time zone,
  "certified_by" varchar(100),
  "certified_by_sub" varchar(100),
  "revoked_at" timestamp with time zone,
  "revoked_by" varchar(100),
  "revoked_by_sub" varchar(100),
  "revoked_reason" varchar(300),
  "revoke_kind" text,
  "eligible" boolean DEFAULT false NOT NULL,
  "eligibility" jsonb,
  "last_evaluated_at" timestamp with time zone,
  "ineligible_since" timestamp with time zone,
  "eligible_alerted_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendor_certifications_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  -- Certify records who; a revocation always says who, how and why, and
  -- only ends a certification there was.
  CONSTRAINT "vendor_certifications_certified_by_check" CHECK (
    ("certified_at" IS NULL) = ("certified_by" IS NULL)
  ),
  CONSTRAINT "vendor_certifications_revoked_check" CHECK (
    "revoked_at" IS NULL
    OR (
      "certified_at" IS NOT NULL
      AND "revoked_by" IS NOT NULL
      AND "revoke_kind" IS NOT NULL
      AND "revoked_reason" IS NOT NULL
      AND char_length(btrim("revoked_reason")) > 0
    )
  ),
  CONSTRAINT "vendor_certifications_revoke_kind_check" CHECK (
    "revoke_kind" IS NULL OR "revoke_kind" IN ('revoked', 'lapsed')
  ),
  -- The 14 days only run on a certified garage.
  CONSTRAINT "vendor_certifications_ineligible_since_check" CHECK (
    "ineligible_since" IS NULL OR ("certified_at" IS NOT NULL AND "revoked_at" IS NULL)
  )
);--> statement-breakpoint

-- "Certified only" on the customer lists, and the admin list's chip.
CREATE INDEX IF NOT EXISTS "vendor_certifications_certified_idx"
  ON "vendor_certifications" ("vendor_id")
  WHERE "certified_at" IS NOT NULL AND "revoked_at" IS NULL;
