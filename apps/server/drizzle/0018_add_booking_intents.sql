-- Booking intents: a validated, priced booking that has not been paid for yet.
--
-- Bookings used to be written before Razorpay opened, so abandoning the
-- checkout sheet left a live request in front of the garage, a promo code held
-- by a booking nobody paid for, and a vehicle lock that blocked the customer's
-- own retry. An intent holds none of those. It is inert until the money lands,
-- at which point confirmIntent turns it into a booking + a paid payment + any
-- redemption, in one transaction.
--
-- Nothing here touches existing rows: this is one new type and one new table.

CREATE TYPE "public"."booking_intent_status" AS ENUM('pending', 'consumed', 'failed');--> statement-breakpoint

CREATE TABLE "booking_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"booking_type" "booking_type" NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	-- Snapshotted alongside the prices below, so a vendor editing a service
	-- mid-checkout cannot change what the customer already agreed to.
	"service_duration_mins" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"subtotal_amount" numeric(10, 2) NOT NULL,
	"discount_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"discount_id" uuid,
	"discount_code" varchar(40),
	"discount_funded_by" "discount_funded_by",
	"payment_method" "payment_method" NOT NULL,
	"lat" real,
	"lng" real,
	"address" text,
	-- The Razorpay order id. Unique because it is how the webhook finds this
	-- intent when the client never comes back to confirm it.
	"gateway_txn_id" varchar(255),
	"status" "booking_intent_status" DEFAULT 'pending' NOT NULL,
	-- Set when the intent is consumed. Its presence is the idempotency record:
	-- the client callback and the webhook both confirm, and whichever arrives
	-- second returns this booking instead of creating a second one.
	"booking_id" uuid,
	-- Only set on 'failed': the captured payment awaiting a manual refund, and
	-- why the booking could not be written.
	"payment_ref" varchar(255),
	"failure_reason" varchar(255),
	-- Enforced on read, not by a job — an expired intent holds no resource.
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_intents_gateway_txn_id_unique" UNIQUE("gateway_txn_id")
);
--> statement-breakpoint

ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_vehicle_id_user_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."user_vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "booking_intents_user_id_idx" ON "booking_intents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "booking_intents_status_idx" ON "booking_intents" USING btree ("status");
