-- Trust & look: Bronze / Silver / Gold tiers and the click-to-agree garage
-- agreement (owner, 29 Oct 2026: tiers replace "Documents verified" and
-- "Detlio Certified").
--
--   - `agreement_versions`: each Detlio garage agreement admin published, as
--     a PDF in the public R2 bucket under `agreements/` (the agreement is not
--     secret, and the private documents bucket is not set in production).
--     `version` counts up from 1; the highest is the one garages are asked to
--     accept. Never deleted: acceptances point at them.
--   - `agreement_acceptances`: a garage's owner seat ticked "I agree to the
--     terms" and pressed Confirm: which garage, which version, who (the user,
--     and their name as it was), when, and a keyed hash of the IP address
--     (never the address). One per garage and version. Kept while the garage
--     row exists, a tombstone included (the contract behind kept bookings);
--     deleting the user only sets `user_id` to null.
--   - `tier_switches`: whether customers see each tier's medal (admin
--     Settings → Tiers), e.g. only Gold during the pilot. One row per tier,
--     all on to begin with, so nothing customers see today goes away.
--     Garages always see their own tier, whatever these say.
--   - `vendor_tier_standings`: Silver, which the nightly run gives and takes
--     (lib/tiers.ts): `silver_at` while the garage holds it, `silver_short_since`
--     starting its 14 days when it falls short, the last evaluation (for the
--     admin list) and when it was lost. Bronze is not stored: it is worked
--     out from the acceptances. Gold is Detlio Certified (0048,
--     vendor_certifications), renamed.
--   - `vendors.tier_hidden`: admin hid this garage's medal from customers
--     (during a complaint, say). The garage still sees its tier.
--
-- The backfill: garages certified today are Gold already (their
-- vendor_certifications rows are untouched), and they hold Silver from the
-- day they were certified, since Gold's standards are stricter than every
-- Silver one. Their documents carry over as they are: the uploaded
-- "agreement" document no longer counts toward documents (the click-to-agree
-- agreement replaces it), so a garage with its shop photo, ID and bank proof
-- approved now has its documents checked even if its paper agreement was
-- still waiting. Nothing is taken away by this migration: the nightly run
-- changes no tier until admin has published the first agreement (lib/tiers.ts,
-- `tierRunPaused`). From the night it is published, a garage holding Silver
-- or Gold that has not accepted it is short and keeps its tier for 14 days
-- (the 30 days are for a garage that accepted an earlier version when a new
-- one comes out), so publish the first version before those garages are
-- asked to accept it.
--
-- Additive: new tables, one new column with a default, and rows. Applied by
-- scripts/migrate.sh in one transaction; every statement is safe to re-run.

CREATE TABLE IF NOT EXISTS "agreement_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version" integer NOT NULL,
  -- The object in the public bucket, and its address as the API built it.
  "file_key" varchar(300) NOT NULL,
  "file_url" varchar(600) NOT NULL,
  "size_bytes" integer NOT NULL,
  -- SHA-256 of the file as published, hex: what was accepted can be proved
  -- against the PDF even if the object were ever replaced.
  "sha256" varchar(64) NOT NULL,
  -- What changed, for the team and the garage ("Pickup clause added").
  "note" varchar(300),
  "published_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- The signed-in admin's name, as every admin action is signed (0058).
  "published_by" varchar(100) NOT NULL,
  "published_by_sub" varchar(100) NOT NULL,
  CONSTRAINT "agreement_versions_version_check" CHECK ("version" >= 1),
  CONSTRAINT "agreement_versions_key_check" CHECK ("file_key" ~ '^agreements/v[0-9]+-[0-9a-f-]{36}\.pdf$'),
  -- 10 MB, as lib/agreements.ts limits the upload.
  CONSTRAINT "agreement_versions_size_check" CHECK ("size_bytes" BETWEEN 1 AND 10485760),
  CONSTRAINT "agreement_versions_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "agreement_versions_published_by_check" CHECK (char_length(btrim("published_by")) > 0)
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "agreement_versions_version_key" ON "agreement_versions" ("version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agreement_versions_file_key_key" ON "agreement_versions" ("file_key");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agreement_acceptances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "version_id" uuid NOT NULL,
  -- The version's number, kept beside its id so "accepted the latest" is
  -- one comparison.
  "version" integer NOT NULL,
  "user_id" uuid,
  -- Who it was, as their account said then: the account may be deleted
  -- later, and the record must still say who agreed.
  "accepted_by_name" varchar(120) NOT NULL,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- HMAC-SHA256 of the IP address, keyed from JWT_SECRET (lib/agreements.ts
  -- `ipHash`), hex. Null when the request carried no address.
  "ip_hash" varchar(64),
  CONSTRAINT "agreement_acceptances_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "agreement_acceptances_version_id_agreement_versions_id_fk"
    FOREIGN KEY ("version_id") REFERENCES "public"."agreement_versions"("id")
    ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "agreement_acceptances_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "agreement_acceptances_name_check" CHECK (char_length(btrim("accepted_by_name")) > 0),
  CONSTRAINT "agreement_acceptances_ip_hash_check" CHECK ("ip_hash" IS NULL OR "ip_hash" ~ '^[0-9a-f]{64}$')
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "agreement_acceptances_vendor_version_key"
  ON "agreement_acceptances" ("vendor_id", "version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agreement_acceptances_vendor_idx"
  ON "agreement_acceptances" ("vendor_id", "version" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agreement_acceptances_version_idx"
  ON "agreement_acceptances" ("version_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tier_switches" (
  "tier" text PRIMARY KEY NOT NULL,
  "shown" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" varchar(100),
  CONSTRAINT "tier_switches_tier_check" CHECK ("tier" IN ('bronze', 'silver', 'gold'))
);--> statement-breakpoint

INSERT INTO "tier_switches" ("tier", "shown")
VALUES ('bronze', true), ('silver', true), ('gold', true)
ON CONFLICT ("tier") DO NOTHING;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vendor_tier_standings" (
  "vendor_id" uuid PRIMARY KEY NOT NULL,
  -- Silver since; null while the garage does not hold it.
  "silver_at" timestamp with time zone,
  -- While holding Silver and falling short: the first night it did.
  "silver_short_since" timestamp with time zone,
  -- How the last Silver ended (the 14 days ran out).
  "silver_lost_at" timestamp with time zone,
  "silver_eligible" boolean DEFAULT false NOT NULL,
  -- The last evaluation's checklist (lib/tiers.ts TierSnapshot), for admin.
  "evaluation" jsonb,
  "last_evaluated_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendor_tier_standings_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  -- The 14 days only run on a garage holding Silver.
  CONSTRAINT "vendor_tier_standings_short_check" CHECK (
    "silver_short_since" IS NULL OR "silver_at" IS NOT NULL
  )
);--> statement-breakpoint

-- "Silver & above" on the customer lists.
CREATE INDEX IF NOT EXISTS "vendor_tier_standings_silver_idx"
  ON "vendor_tier_standings" ("vendor_id")
  WHERE "silver_at" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "tier_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- The backfill: a garage certified today holds Silver from the day it was
-- certified (Gold's standards include every Silver one but the agreement,
-- which no garage could accept before this release).
INSERT INTO "vendor_tier_standings" ("vendor_id", "silver_at", "silver_eligible")
SELECT vc."vendor_id", vc."certified_at", true
  FROM "vendor_certifications" vc
 WHERE vc."certified_at" IS NOT NULL
   AND vc."revoked_at" IS NULL
ON CONFLICT ("vendor_id") DO NOTHING;
