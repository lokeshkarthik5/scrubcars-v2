-- Behaviour: the steps from the landing page to a paid booking (owner,
-- 27 Oct 2026: "a heatmap and each and every move so we can work on where
-- customers bounce off and why"), measured before the landing page changes
-- so later releases can show they helped. Admin's Statistics → Behaviour.
--
-- Changes, all to 0040's `analytics_events` (no new table):
--
--   - New event names in the name CHECK (replaced, as 0040 planned for):
--     `landing_view` (the homepage), `garage_card_seen` (a garage card was
--     on screen in a list, once per visit), `area_pick`, `mode_switch`
--     (At garage / Doorstep / Pickup), `service_sheet_open`,
--     `booking_start` (Book Now), `otp_sent` (a sign-in code went to the
--     number typed: that one did, never which), `pay_success`,
--     `pay_failed`; and, named now for the landing page's next release,
--     `request_sent`, `free_wash_claim`, `banner_view`, `banner_close`.
--   - New prop keys in the props CHECK: `medium`, `campaign`, `referrer`,
--     `channel` (on app_open: the visit's utm_ tags as slugs, the referring
--     site's domain only, never its address, and the channel those add up
--     to: instagram, google, facebook, whatsapp, direct or other), and
--     `area`, `banner` (slugs the app itself chose, such as anna-nagar).
--     The API checks each value's shape; the CHECK is the backstop.
--   - An index on `visit_id`: the Behaviour tab reads events a visit at a
--     time, and signing in attaches the account to that visit's earlier
--     events (only that visit's, only ones with no account yet).
--
-- Still no personal data in an event: no name, number, address, IP address
-- or user agent. Kept 180 days like every event.
--
-- Additive: widened CHECKs that every row today's code writes still
-- passes, and an index. Applied by scripts/migrate.sh in one transaction;
-- every statement is safe to re-run.

ALTER TABLE "analytics_events" DROP CONSTRAINT IF EXISTS "analytics_events_name_check";--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_name_check" CHECK (
  "name" IN ('app_open', 'home_view', 'garage_list_view', 'search', 'map_view',
             'garage_view', 'service_add', 'checkout_start', 'slot_select',
             'address_select', 'pay_click', 'booking_paid', 'booking_cancelled',
             'review_submit', 'complaint_submit', 'help_view',
             'favourite_add', 'favourite_remove', 'coupon_scan', 'coupon_redeem',
             'landing_view', 'garage_card_seen', 'area_pick', 'mode_switch',
             'service_sheet_open', 'booking_start', 'otp_sent', 'pay_success',
             'pay_failed', 'request_sent', 'free_wash_claim', 'banner_view',
             'banner_close')
);--> statement-breakpoint

ALTER TABLE "analytics_events" DROP CONSTRAINT IF EXISTS "analytics_events_props_check";--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_props_check" CHECK (
  jsonb_typeof("props") = 'object'
  AND "props" - ARRAY['vendorId', 'mode', 'category', 'serviceCount', 'amountBucket',
                      'source', 'step', 'queryLength', 'cancelledBy',
                      'medium', 'campaign', 'referrer', 'channel', 'area',
                      'banner']::text[] = '{}'::jsonb
);--> statement-breakpoint

-- A visit's events, for the Behaviour tab and for attaching an account to
-- a visit on sign-in. The API's own events have no visit, so it is partial.
CREATE INDEX IF NOT EXISTS "analytics_events_visit_id_idx"
  ON "analytics_events" ("visit_id")
  WHERE "visit_id" IS NOT NULL;
