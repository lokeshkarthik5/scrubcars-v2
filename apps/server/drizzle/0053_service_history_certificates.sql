-- Detlio Service History certificate: a customer's share links.
--
-- A customer can print a "Detlio Service History" certificate for one of
-- their cars (every completed job done through Detlio, newest first) and
-- share it: the certificate carries a QR code and a short link to a public
-- page, /verify/<token>, which anyone can open signed out to check it is
-- genuine. That page shows the car (make, model, colour, body type and a
-- masked registration), the garages, dates and services, and before/after
-- photos only when the customer ticked "Include photos". Never the owner's
-- name, phone or address, the full plate, prices or booking ids.
--
--   - `vehicle_certificate_links`: one row per link the customer made. The
--     token is never stored: `token_hash` is its SHA-256 (unique). A link
--     works while `revoked_at` is null and `expires_at` (optional, none by
--     default) is ahead. "Stop sharing" sets `revoked_at`; sharing again
--     makes a new row (a new token), and making one ends the car's previous
--     link in the same transaction, so a car has at most one link not
--     revoked (partial unique index). `include_photos` can be switched on
--     and off on the live link. `view_count` / `last_viewed_at` are bumped
--     by each successful public lookup (shown to the customer and, as
--     totals, to admin). Cascades with the car and with the customer.
--
-- Purely additive: a new table nothing in production reads yet, so it is
-- safe to apply before the code that uses it is deployed.
--
-- Numbering: runs after 0050, 0051 and 0052 (rewards, the guarantee, bypass
-- reports), which this branch now sits on, with no gap. Nothing here depends
-- on any of them.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

CREATE TABLE IF NOT EXISTS "vehicle_certificate_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "vehicle_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "include_photos" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "last_viewed_at" timestamp with time zone,
  "view_count" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "vehicle_certificate_links_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "vehicle_certificate_links_vehicle_id_user_vehicles_id_fk"
    FOREIGN KEY ("vehicle_id") REFERENCES "public"."user_vehicles"("id")
    ON DELETE cascade ON UPDATE no action,
  -- A hex SHA-256: 64 characters, never the token itself.
  CONSTRAINT "vehicle_certificate_links_token_hash_check"
    CHECK (char_length("token_hash") = 64),
  CONSTRAINT "vehicle_certificate_links_view_count_check"
    CHECK ("view_count" >= 0),
  CONSTRAINT "vehicle_certificate_links_expiry_check"
    CHECK ("expires_at" IS NULL OR "expires_at" > "created_at")
);

-- The public page finds a link by its token's hash, and only by it.
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_certificate_links_token_hash_idx"
  ON "vehicle_certificate_links" ("token_hash");

-- At most one link a car that is not revoked: making a new one ends the old.
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_certificate_links_one_live_idx"
  ON "vehicle_certificate_links" ("vehicle_id")
  WHERE "revoked_at" IS NULL;

-- The customer's own links (the cascade from users, and their car pages).
CREATE INDEX IF NOT EXISTS "vehicle_certificate_links_user_id_idx"
  ON "vehicle_certificate_links" ("user_id");
