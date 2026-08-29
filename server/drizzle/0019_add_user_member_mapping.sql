-- Multi-tenancy, phase 1: the seat table, and the booking actor columns.
--
-- A garage stops being one person. `vendors.owner_id` still names the one
-- person who owns the business; `user_member_mapping` answers the separate
-- question of who can use the portal and with what power.
--
-- One table carries both scopes. A Detlio staff grant (vendor_id IS NULL) and a
-- garage seat are the same insert against the same index, so there is one
-- resolver, one status filter and one revocation path instead of two of each.
--
-- Nothing reads this table yet. It is additive: existing rows are untouched and
-- the backfill below is reversible by dropping the table.

CREATE TYPE "public"."member_role" AS ENUM('user', 'super_admin', 'vendor_admin', 'vendor_operator');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active', 'suspended');--> statement-breakpoint

CREATE TABLE "user_member_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	-- NULL = platform-scoped, meaning every company.
	"vendor_id" uuid,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	-- Without this, ('vendor_operator', NULL) is representable — a company seat
	-- that silently applies to every company. That is the single worst row this
	-- schema can hold and it is one typo away in any insert path, so it belongs
	-- here rather than in a service-layer validation.
	CONSTRAINT "user_member_mapping_scope_check" CHECK (
		("role" IN ('vendor_admin', 'vendor_operator') AND "vendor_id" IS NOT NULL)
		OR
		("role" IN ('user', 'super_admin') AND "vendor_id" IS NULL)
	)
);
--> statement-breakpoint

ALTER TABLE "user_member_mapping" ADD CONSTRAINT "user_member_mapping_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_member_mapping" ADD CONSTRAINT "user_member_mapping_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_member_mapping" ADD CONSTRAINT "user_member_mapping_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- One role per person per company.
CREATE UNIQUE INDEX "user_member_mapping_vendor_user_key" ON "user_member_mapping" USING btree ("vendor_id","user_id");--> statement-breakpoint
-- The composite above does not cover platform rows: Postgres treats NULLs as
-- distinct in a unique index, so (NULL, user_x) could be inserted repeatedly.
-- This partial index is what makes "one platform role per person" true — you
-- cannot hold super_admin twice, and you cannot hold 'user' and 'super_admin'
-- at once. (PG 15+ could use NULLS NOT DISTINCT; this works on every version.)
CREATE UNIQUE INDEX "user_member_mapping_platform_user_key" ON "user_member_mapping" USING btree ("user_id") WHERE "vendor_id" IS NULL;--> statement-breakpoint
-- "which companies can I act as?", and the super-admin check.
CREATE INDEX "user_member_mapping_user_id_idx" ON "user_member_mapping" USING btree ("user_id");--> statement-breakpoint
-- The member list screen.
CREATE INDEX "user_member_mapping_vendor_id_idx" ON "user_member_mapping" USING btree ("vendor_id");--> statement-breakpoint

-- Backfill: every existing company gets exactly one vendor_admin — its owner.
-- Idempotent via the unique index above.
INSERT INTO "user_member_mapping" ("vendor_id", "user_id", "role")
SELECT "id", "owner_id", 'vendor_admin' FROM "vendors"
ON CONFLICT ("vendor_id", "user_id") DO NOTHING;--> statement-breakpoint

-- No backfill for 'user': the absence of a row *is* that role, and
-- materializing it would grant exactly nothing. None for 'super_admin' either —
-- the existing platform admin is an env credential with no users row, so the
-- first named super-admin is an explicit grant, not a migration.

-- Which person moved the job, not which company. With a team, "who accepted
-- this?" is otherwise unanswerable, and this is painful to backfill later.
ALTER TABLE "bookings" ADD COLUMN "accepted_by" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "completed_by" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
