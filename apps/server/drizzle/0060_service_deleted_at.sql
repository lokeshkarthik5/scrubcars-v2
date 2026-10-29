-- Any service can be deleted (owner, 28 Oct 2026).
--
-- A service nobody has booked is still deleted outright. One that bookings
-- name cannot be — the restrict foreign keys keep past bookings and receipts
-- whole — so deleting it switches it off and stamps `deleted_at`: customers
-- already never see a switched-off service, and from now on neither the
-- garage app nor admin lists it, hidden or not, and it cannot be shown again.
-- Bookings keep reading it by id, as before.

ALTER TABLE "services" ADD COLUMN "deleted_at" timestamp with time zone;
