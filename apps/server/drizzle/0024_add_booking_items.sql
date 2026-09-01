-- Multi-service bookings.
--
-- A booking was one service: `bookings.service_id`, one price, one duration.
-- The line items move to their own table so a customer can book "wash +
-- interior + polish" in one go, and so a booking finally records *what it was
-- sold*, not a pointer to a row the vendor can edit afterwards.
--
-- Three things are deliberate here:
--
--   1. `service_id` stays on bookings, still written with the first item. Every
--      existing reader (vendor lists, earnings, admin, review context) keeps
--      working untouched; migrating them off it is a separate pass. It becomes
--      nullable now so that pass can drop it without a second schema change.
--   2. `duration_mins` is added to bookings. The vehicle-overlap check used to
--      join `services.duration_mins` to work out when a booking ends — which
--      silently moved every existing booking's window whenever a vendor edited
--      the service. A booking's duration is now the sum of its items, snapshot
--      at write time.
--   3. Items snapshot name, price and duration for the same reason
--      `booking_intents` snapshots everything: a vendor editing a price must
--      not change what an existing booking says it charged.

ALTER TABLE "bookings"
  ADD COLUMN "duration_mins" integer;--> statement-breakpoint

ALTER TABLE "bookings"
  ALTER COLUMN "service_id" DROP NOT NULL;--> statement-breakpoint

CREATE TABLE "booking_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "duration_mins" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "booking_intent_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "intent_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "duration_mins" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Items die with their booking; the service they point at does not, so it is
-- restricted the same way `bookings.service_id` is.
ALTER TABLE "booking_items"
  ADD CONSTRAINT "booking_items_booking_id_bookings_id_fk"
  FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "booking_items"
  ADD CONSTRAINT "booking_items_service_id_services_id_fk"
  FOREIGN KEY ("service_id") REFERENCES "public"."services"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "booking_intent_items"
  ADD CONSTRAINT "booking_intent_items_intent_id_booking_intents_id_fk"
  FOREIGN KEY ("intent_id") REFERENCES "public"."booking_intents"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "booking_intent_items"
  ADD CONSTRAINT "booking_intent_items_service_id_services_id_fk"
  FOREIGN KEY ("service_id") REFERENCES "public"."services"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "booking_items_booking_id_idx" ON "booking_items" ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_items_service_id_idx" ON "booking_items" ("service_id");--> statement-breakpoint
CREATE INDEX "booking_intent_items_intent_id_idx" ON "booking_intent_items" ("intent_id");--> statement-breakpoint

-- One row per service, so a booking cannot list the same service twice. The
-- product has no quantity concept: two coats of polish is a different service,
-- not the same one added twice.
CREATE UNIQUE INDEX "booking_items_booking_service_key"
  ON "booking_items" ("booking_id", "service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_intent_items_intent_service_key"
  ON "booking_intent_items" ("intent_id", "service_id");--> statement-breakpoint

-- Backfill. Every existing booking is single-service by construction, so it
-- becomes exactly one item. `subtotal_amount` (pre-discount) is the line
-- amount, not `amount` — the discount belongs to the booking, not the line.
INSERT INTO "booking_items"
  ("booking_id", "service_id", "name", "amount", "duration_mins", "sort_order")
SELECT b."id",
       b."service_id",
       s."name",
       COALESCE(b."subtotal_amount", b."amount"),
       s."duration_mins",
       0
  FROM "bookings" b
  JOIN "services" s ON s."id" = b."service_id"
 WHERE b."service_id" IS NOT NULL;--> statement-breakpoint

INSERT INTO "booking_intent_items"
  ("intent_id", "service_id", "name", "amount", "duration_mins", "sort_order")
SELECT i."id",
       i."service_id",
       s."name",
       i."subtotal_amount",
       i."service_duration_mins",
       0
  FROM "booking_intents" i
  JOIN "services" s ON s."id" = i."service_id";--> statement-breakpoint

UPDATE "bookings" b
   SET "duration_mins" = s."duration_mins"
  FROM "services" s
 WHERE s."id" = b."service_id"
   AND b."duration_mins" IS NULL;--> statement-breakpoint

-- Nothing can reach this point without a duration: the backfill covers every
-- row that has a service, and `service_id` was NOT NULL until this migration.
ALTER TABLE "bookings"
  ALTER COLUMN "duration_mins" SET NOT NULL;--> statement-breakpoint

COMMENT ON COLUMN "bookings"."service_id" IS
  'Deprecated: the first booking_items row. Still written for existing readers; drop once they read booking_items.';--> statement-breakpoint

COMMENT ON COLUMN "bookings"."duration_mins" IS
  'Total booked duration, the sum of booking_items.duration_mins, snapshot at write time.';
