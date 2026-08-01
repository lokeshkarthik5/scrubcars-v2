ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "logo_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "logo_storage_key" varchar(1024);
