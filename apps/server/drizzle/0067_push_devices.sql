-- Push notifications for the native apps (Expo), beside browser push.
--
-- `push_subscriptions` (0044) holds browsers and stays exactly as it is.
-- `push_devices` holds phones: one row per installed app that turned
-- notifications on. `token` is the Expo push token the app got from
-- Expo (`ExponentPushToken[...]`; unique, a device identifier, never
-- logged, shape also checked by the API before it is stored). `platform` is
-- `ios` or `android`. Scoped exactly as subscriptions are: `audience` is the
-- app it came from (`customer` or `garage`), and a garage's rows name the
-- garage the seat turned it on for in `vendor_id` (exactly when `garage`).
-- Removed when the person turns it off or signs out, when Expo says the
-- token is dead (DeviceNotRegistered), after repeated failed sends, and with
-- the account. Cascades with the user and with the garage.
--
-- Purely additive: one new table that today's API never reads, so it is safe
-- to apply before the code that uses it is deployed.
--
-- Applied by scripts/migrate.sh, one transaction per file. Every statement is
-- also safe to re-run.

CREATE TABLE IF NOT EXISTS "push_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token" varchar(200) NOT NULL,
  "platform" text NOT NULL,
  "user_id" uuid NOT NULL,
  "audience" text NOT NULL,
  "vendor_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_success_at" timestamp with time zone,
  "failure_count" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "push_devices_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "push_devices_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "push_devices_platform_check" CHECK ("platform" IN ('ios', 'android')),
  CONSTRAINT "push_devices_audience_check" CHECK ("audience" IN ('customer', 'garage')),
  -- A garage's device names its garage; a customer's never does.
  CONSTRAINT "push_devices_vendor_check" CHECK (("audience" = 'garage') = ("vendor_id" IS NOT NULL)),
  -- Expo's token shape (lib/expo-push.ts isExpoPushToken).
  CONSTRAINT "push_devices_token_check"
    CHECK ("token" ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{16,64}\]$'),
  CONSTRAINT "push_devices_failure_count_check" CHECK ("failure_count" >= 0)
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "push_devices_token_key"
  ON "push_devices" ("token");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "push_devices_user_id_idx"
  ON "push_devices" ("user_id");--> statement-breakpoint

-- Every device of a garage, for its booking events.
CREATE INDEX IF NOT EXISTS "push_devices_vendor_id_idx"
  ON "push_devices" ("vendor_id")
  WHERE "vendor_id" IS NOT NULL;
