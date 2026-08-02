ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_storage_key" varchar(1024);
