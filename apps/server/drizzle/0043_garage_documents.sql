-- Garage documents: the garage uploads them, Detlio checks them, and a
-- "Documents verified" badge shows to customers.
--
-- Owner decision (17 Oct 2026): "A separate section where they upload their
-- documents and we verify and give them a documents-verified badge." It is
-- separate from `vendors.is_verified`, which still only decides whether a
-- garage is listed; nothing here reads or writes it.
--
-- Two tables:
--
--   - `vendor_documents`: one row per garage per type, the current upload and
--     where its review stands. Types (text + CHECK): `shop_photo`,
--     `owner_id`, `bank_proof` and `agreement` are required for the badge;
--     `gst_certificate` and `trade_licence` (with an optional expiry date)
--     are optional. Status `pending` → `approved` / `rejected`; a rejection
--     carries the reason the garage reads. `reviewed_by` is the name the
--     admin typed, as the Bin records it. Uploading again replaces the files,
--     bumps `version` and puts it back to pending; an admin's review names
--     the version they opened, so files nobody has looked at are never
--     approved by a press made on the old ones.
--   - `vendor_document_files`: the document's front, and a back when it has
--     one, in the private R2 bucket (R2_DOCS_BUCKET, no public access). Only
--     the key is stored, never a URL: a file is read through a five-minute
--     presigned link made for the garage's owner seat or a super-admin.
--
-- No history of replaced files is kept on purpose: an old ID card or bank
-- proof has no use once replaced, so the API deletes its rows here and its
-- object in the bucket after the commit. The garage's deletion cascades to
-- both tables; Delete forever also removes the objects, and on a tombstone
-- keeps only the signed agreement (the contract behind the bookings kept
-- for their real money).
--
-- Purely additive: two new tables that today's API never reads, so it is
-- safe to apply before the code that uses it is deployed. Numbered 0043:
-- 0042 belongs to the garage response deadline, built in parallel.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

CREATE TABLE IF NOT EXISTS "vendor_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL,
  "type" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "expires_on" date,
  "uploaded_by" varchar(100) NOT NULL,
  "uploaded_by_sub" varchar(100) NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_by" varchar(100),
  "reviewed_by_sub" varchar(100),
  "reviewed_at" timestamp with time zone,
  "rejection_reason" varchar(300),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendor_documents_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "vendor_documents_vendor_id_type_key" UNIQUE ("vendor_id", "type"),
  CONSTRAINT "vendor_documents_type_check" CHECK (
    "type" IN ('shop_photo', 'owner_id', 'bank_proof', 'agreement', 'gst_certificate', 'trade_licence')
  ),
  CONSTRAINT "vendor_documents_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected')),
  CONSTRAINT "vendor_documents_version_check" CHECK ("version" > 0),
  -- Only a trade licence has an expiry date.
  CONSTRAINT "vendor_documents_expires_on_check" CHECK ("expires_on" IS NULL OR "type" = 'trade_licence'),
  CONSTRAINT "vendor_documents_uploaded_by_check" CHECK (char_length(btrim("uploaded_by")) > 0),
  -- Pending has no review; a review has a reviewer and a time.
  CONSTRAINT "vendor_documents_review_check" CHECK (
    ("status" = 'pending') = ("reviewed_at" IS NULL)
    AND ("reviewed_at" IS NULL) = ("reviewed_by" IS NULL)
  ),
  -- A rejection always says why; nothing else carries a reason.
  CONSTRAINT "vendor_documents_rejection_reason_check" CHECK (
    ("status" = 'rejected') = ("rejection_reason" IS NOT NULL AND char_length(btrim("rejection_reason")) > 0)
  )
);--> statement-breakpoint

-- "Documents to review (N)" on the admin garage list.
CREATE INDEX IF NOT EXISTS "vendor_documents_pending_idx"
  ON "vendor_documents" ("vendor_id")
  WHERE "status" = 'pending';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vendor_document_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL,
  "side" text NOT NULL,
  -- vendors/<vendorId>/documents/<type>/<uuid>.<ext> in the private bucket.
  "storage_key" varchar(512) NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendor_document_files_document_id_vendor_documents_id_fk"
    FOREIGN KEY ("document_id") REFERENCES "public"."vendor_documents"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "vendor_document_files_document_id_side_key" UNIQUE ("document_id", "side"),
  CONSTRAINT "vendor_document_files_side_check" CHECK ("side" IN ('front', 'back')),
  CONSTRAINT "vendor_document_files_content_type_check" CHECK (
    "content_type" IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  -- 10 MB a file (MAX_DOCUMENT_BYTES).
  CONSTRAINT "vendor_document_files_size_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760)
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "vendor_document_files_storage_key_key"
  ON "vendor_document_files" ("storage_key");
