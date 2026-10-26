-- Onboarding marks, collection lists and Onboarded by (owner, 26 Oct 2026;
-- admin UX audit items 12 and 13, mockups 06 and 07).
--
-- Changes:
--
--   - `vendor_onboarding_marks`: the team's own notes on what to ask a
--     garage's owner for, and where that stands: To ask → Asked → Received.
--     `kind` is one of the garage's missing keys (lib/vendor-missing.ts:
--     'photos', 'payout'…) or 'custom', which needs its own label. At most
--     one open mark per garage and missing key (a partial unique index), so
--     a second "Ask for photos" is refused; custom marks are free. Asked
--     carries when (a CHECK). The Missing tags themselves are worked out
--     from the garage's own data and never stored.
--   - `collection_lists` and `collection_items` ("Send to team"): a list of
--     things one teammate is to collect from a few garages, with a due date
--     and a note; one item per garage and thing. The assignee's login is
--     kept with their name, so the list still says who if the login goes.
--     "Cleared" (the garage no longer misses that thing) is worked out, not
--     stored. A list is open until closed or until every item is done.
--   - `vendors.onboarded_by_name`: who on the team brought the garage in,
--     set by hand in admin. Nothing fills it in automatically.
--   - `admin_logins.phone`: optional, only for "Also send on WhatsApp" when
--     a collection list goes to that person.
--
-- Additive: nothing reads these before this release. Deleting a garage
-- forever (or keeping it as a tombstone) deletes its marks and items, as
-- notes can hold personal details.
CREATE TABLE IF NOT EXISTS "vendor_onboarding_marks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "label" varchar(60),
  "note" text,
  "status" text DEFAULT 'to_ask' NOT NULL,
  "asked_at" timestamp with time zone,
  "asked_by_name" varchar(100),
  "received_at" timestamp with time zone,
  "created_by_name" varchar(100) NOT NULL,
  "updated_by_name" varchar(100),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendor_onboarding_marks_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "vendor_onboarding_marks_status_check" CHECK ("status" IN ('to_ask', 'asked', 'received')),
  CONSTRAINT "vendor_onboarding_marks_asked_check" CHECK ("status" <> 'asked' OR "asked_at" IS NOT NULL),
  CONSTRAINT "vendor_onboarding_marks_label_check" CHECK (
    "kind" <> 'custom' OR ("label" IS NOT NULL AND char_length(btrim("label")) > 0)
  ),
  CONSTRAINT "vendor_onboarding_marks_note_check" CHECK ("note" IS NULL OR char_length("note") <= 500)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_onboarding_marks_vendor_id_idx" ON "vendor_onboarding_marks" USING btree ("vendor_id");--> statement-breakpoint
-- One open mark per garage and missing key; received ones are history.
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_onboarding_marks_open_kind_idx" ON "vendor_onboarding_marks" USING btree ("vendor_id", "kind")
  WHERE "kind" <> 'custom' AND "status" <> 'received';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collection_lists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "assignee_login_id" uuid,
  "assignee_name" varchar(100) NOT NULL,
  "due_on" date,
  "note" text,
  "created_by_name" varchar(100) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "telegram_sent_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  CONSTRAINT "collection_lists_assignee_login_id_admin_logins_id_fk"
    FOREIGN KEY ("assignee_login_id") REFERENCES "public"."admin_logins"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "collection_lists_note_check" CHECK ("note" IS NULL OR char_length("note") <= 500)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collection_lists_assignee_login_id_idx" ON "collection_lists" USING btree ("assignee_login_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collection_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "list_id" uuid NOT NULL,
  "vendor_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "label" varchar(80),
  "status" text DEFAULT 'to_collect' NOT NULL,
  "collected_at" timestamp with time zone,
  "collected_by_name" varchar(100),
  "note" text,
  CONSTRAINT "collection_items_list_id_collection_lists_id_fk"
    FOREIGN KEY ("list_id") REFERENCES "public"."collection_lists"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "collection_items_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "collection_items_status_check" CHECK ("status" IN ('to_collect', 'collected')),
  CONSTRAINT "collection_items_collected_check" CHECK ("status" <> 'collected' OR "collected_at" IS NOT NULL),
  CONSTRAINT "collection_items_note_check" CHECK ("note" IS NULL OR char_length("note") <= 500)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collection_items_list_id_idx" ON "collection_items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collection_items_vendor_id_idx" ON "collection_items" USING btree ("vendor_id");--> statement-breakpoint
-- Each thing once per garage on a list.
CREATE UNIQUE INDEX IF NOT EXISTS "collection_items_list_vendor_kind_idx" ON "collection_items" USING btree ("list_id", "vendor_id", "kind");--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "onboarded_by_name" varchar(100);--> statement-breakpoint
ALTER TABLE "admin_logins" ADD COLUMN IF NOT EXISTS "phone" varchar(15);
