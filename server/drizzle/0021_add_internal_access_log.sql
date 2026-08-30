-- Multi-tenancy, phase 8: internal support access.
--
-- A super_admin resolves as vendor_admin inside a company (see resolveTenant) —
-- the *most* privileged company role, not the least. Detlio staff can therefore
-- change a garage's prices, edit its services and read its earnings, and the
-- only control on that is this log. So it is written by the tenant middleware on
-- every support-resolved request, never by a handler that could forget, and it
-- is append-only.
--
-- If read-only support access is wanted later, the fix is a fifth enum value
-- (`vendor_support`) that resolveTenant maps to instead of vendor_admin, with
-- writes refused. The row model leaves room for it; a boolean flag would not.

CREATE TABLE "internal_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"method" varchar(10) NOT NULL,
	"endpoint" varchar(512) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "internal_access_log" ADD CONSTRAINT "internal_access_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_access_log" ADD CONSTRAINT "internal_access_log_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "internal_access_log_user_id_idx" ON "internal_access_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "internal_access_log_vendor_id_idx" ON "internal_access_log" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "internal_access_log_created_at_idx" ON "internal_access_log" USING btree ("created_at");
