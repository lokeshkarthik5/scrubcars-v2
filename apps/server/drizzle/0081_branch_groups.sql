-- Branch groups (owner-approved screens, 18 Nov 2026,
-- reference/mockups/garage-tools/2-branches.html): one business, several
-- garages. "Add a branch…" (0069) copies a garage but left no link back to
-- where it came from; this is that link.
--
--   garage_groups      one row per business: its name ("Shine Auto Spa"),
--                      which the Branches card, the services editor's banner
--                      and the customers' "1 of 3 Shine Auto Spa branches"
--                      say. Set from the first garage's business name without
--                      its area ("Shine Auto Spa – Anna Nagar" → "Shine Auto
--                      Spa", lib/branch-groups.ts groupNameOf).
--   vendors.group_id   the group a garage is a branch of; NULL is none.
--                      ON DELETE SET NULL, so removing a group never touches
--                      a garage. Each branch stays a whole garage of its own:
--                      its own bookings, slots, team, documents, reviews and
--                      bank details.
--
-- Written by code only: "Add a branch" puts the source and the new branch in
-- one group (making it when the source has none), and admin's "Link an
-- existing garage" / "Remove from group" move a garage in or out. Nothing is
-- backfilled here: garages copied before today are linked by hand.
--
-- Purely additive: a new table and a nullable column the old API never
-- reads. Every statement is safe to re-run.

CREATE TABLE IF NOT EXISTS "garage_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "garage_groups_name_check" CHECK (length(btrim("name")) > 0)
);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "group_id" uuid
  REFERENCES "garage_groups" ("id") ON DELETE SET NULL;--> statement-breakpoint
-- Partial: most garages are in no group, and every read is "the garages of
-- this group".
CREATE INDEX IF NOT EXISTS "vendors_group_id_idx" ON "vendors" ("group_id") WHERE "group_id" IS NOT NULL;
