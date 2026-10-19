-- Personal admin logins (owner, 19 Oct 2026; admin UX audit finding 14).
-- The whole team used to sign in to admin with one shared username and
-- password, so about 20 forms asked "Your name" and the audit trail was only
-- as good as what was typed. Now the owner, Raga and later each ops person
-- has a login of their own, and the panel signs every action with it.
--
-- Changes:
--
--   - `admin_logins`: one row per person: a username (lower case, unique),
--     the name every action is signed with, a scrypt password hash (never
--     the password; lib/passwords.ts), on or off, and `sessions_from`:
--     a session minted before it is refused, so turning a login off or
--     resetting its password signs that person out everywhere at once.
--     Usernames and names are each unique (a name in any case), since many
--     records keep only the name.
--   - `is_owner`: the one login that runs the team (owner decision, 19 Oct
--     2026): only it adds logins, resets other people's passwords and turns
--     logins on or off. At most one (a partial unique index), and never off
--     (a CHECK), so the owner cannot be locked out. The shared env login
--     makes the first personal login, which becomes the owner, only while
--     there is none.
--
-- The env-credential login (ADMIN_USERNAME / ADMIN_PASSWORD) stays as the
-- bootstrap and break-glass door: it is how the first personal logins are
-- made, it has no row here, and it still signs as 'admin'.
--
-- Additive: nothing reads this table before this release, and nothing
-- existing changes. Who made or changed a login is in admin_audit_log.
CREATE TABLE IF NOT EXISTS "admin_logins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username" varchar(40) NOT NULL,
  "name" varchar(60) NOT NULL,
  "password_hash" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "sessions_from" timestamp with time zone DEFAULT now() NOT NULL,
  "last_login_at" timestamp with time zone,
  "created_by_name" varchar(100) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_owner" boolean DEFAULT false NOT NULL,
  CONSTRAINT "admin_logins_username_check" CHECK ("username" ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  CONSTRAINT "admin_logins_name_check" CHECK (char_length(btrim("name")) >= 2 AND "name" !~ '[\r\n\t]'),
  CONSTRAINT "admin_logins_status_check" CHECK ("status" IN ('active', 'off')),
  CONSTRAINT "admin_logins_password_hash_check" CHECK ("password_hash" LIKE 'scrypt$%'),
  CONSTRAINT "admin_logins_owner_active_check" CHECK (NOT "is_owner" OR "status" = 'active')
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_logins_username_idx" ON "admin_logins" USING btree ("username");--> statement-breakpoint
-- One person per name: the name is what every action is signed with, and
-- many records keep only the name.
CREATE UNIQUE INDEX IF NOT EXISTS "admin_logins_name_idx" ON "admin_logins" USING btree (lower("name"));--> statement-breakpoint
-- At most one owner.
CREATE UNIQUE INDEX IF NOT EXISTS "admin_logins_one_owner_idx" ON "admin_logins" USING btree ("is_owner") WHERE "is_owner";
