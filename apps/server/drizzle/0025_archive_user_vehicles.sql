-- Let a customer remove a car they have already booked with.
--
-- `bookings.vehicle_id` and `booking_intents.vehicle_id` both reference
-- `user_vehicles` ON DELETE RESTRICT, so deleting a car that has ever been
-- booked raised 23503 and surfaced as a 500. The restriction is right — a
-- booking must always name the car it was for, and history cannot be allowed
-- to lose it — so the fix is to stop deleting the row rather than to weaken
-- the constraint.
--
-- A vehicle with no references is still hard-deleted; only one that history
-- depends on is archived. That keeps the table from filling with tombstones
-- for cars added and removed by mistake.

ALTER TABLE "user_vehicles"
  ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint

-- The garage, the booking picker and the promo check all read "the customer's
-- current cars", which is now a filtered subset of the user's rows. Bookings
-- read a vehicle by primary key and deliberately do not filter, so a past
-- booking still renders the car it was for.
CREATE INDEX "user_vehicles_active_user_id_idx"
  ON "user_vehicles" ("user_id")
  WHERE "archived_at" IS NULL;
