# Browser notifications: setup

Garages hear about new bookings, and customers about their bookings, through
the browser's own notifications (Web Push). It is free: no SMS, no WhatsApp
approval. Native app push (FCM/APNs) comes later and plugs into the same
`notify` in `modules/push/push.service.ts`.

The feature stays **off** until the three `VAPID_*` variables are set in the
Vercel environment of the API (`api.detlio.com`). Off means: every push route
but `/config` answers 404, the customer app has no Profile → Notifications,
the partner portal has no Settings → Notifications and no jobs-page banner,
and nothing is read or sent. Migration `0044_push_notifications` (two new
tables, two new columns on `users`) is applied by CI on merge either way.

## 1. Make the key pair (once)

On any computer with bun:

```sh
bunx web-push generate-vapid-keys
```

It prints a **Public Key** and a **Private Key**. Keep the private key like a
password: it is never committed, pasted in chat or put in a frontend.

## 2. Set the environment (API project on Vercel)

Settings → Environment Variables, **Production** (and Preview only if previews
should send notifications):

| Name | Value |
| --- | --- |
| `VAPID_PUBLIC_KEY` | the Public Key |
| `VAPID_PRIVATE_KEY` | the Private Key |
| `VAPID_SUBJECT` | `mailto:support@detlio.com` (how a push service can reach us) |

Redeploy the API. The frontends need nothing: they ask the API for the public
key (`GET …/push/config`).

**Changing the key pair later** makes every existing subscription useless:
each device must turn notifications on again (their old rows are deleted on
the first failed send). Only rotate if the private key leaked.

## 3. Check it

1. On an Android phone (Chrome) or a computer, open `vendor.detlio.com` →
   Settings → Notifications (or the "Turn on new-booking alerts" banner on
   Home) → turn it on → allow → **Send me a test notification**.
2. Same in the customer app: Profile → Notifications.
3. **iPhone / iPad**: Safari gives notifications only to a web app on the
   Home Screen (iOS 16.4 or later). Share → Add to Home Screen, open Detlio
   from the new icon, then turn notifications on. The screens explain this
   when they are opened in a Safari tab.

## Who gets what

**Garages** (every device of the garage's active seats, owners and operators,
turned on for that garage; a removed or suspended seat, or a garage in the
Bin, gets nothing):

- new paid booking: "New booking · Exterior Wash", "Sat 17 Oct, 10 AM · At
  garage — accept within 30 min"
- 10 minutes before the time to accept runs out, while
  `AUTO_CANCEL_UNANSWERED` is on: "Accept within 10 min or it's cancelled"
- the customer picked one of the suggested times / none of them
- extra work paid / declined
- the customer cancelled or moved the booking
- the booking was cancelled because nobody accepted in time

**Customers** (their devices, by their two switches in Profile →
Notifications):

- *Booking updates*: accepted; declined; other times suggested; extra work
  asked for; car collected, on its way back (pickup & drop); job done ("How
  was it? Rate your wash"); refund started or recorded; complaint
  acknowledged / resolved; not accepted in time
- *Reminders*: the evening before (sent in the 18:00–19:00 IST runs of the
  pending-digest cron, for confirmed bookings the next day) and about an hour
  before (sent 60–70 minutes ahead, never less than 30), confirmed bookings
  only, each at most once per booking (`notification_sends`)

A notification says only booking basics: the garage's name, the service,
the time, an amount, a complaint number. Never a customer's name, phone,
address or car, a pickup code, or anything a person typed. The words are in
`lib/push-messages.ts` and tested for exactly that.

## How it runs

- Events send **after the response** (`runInBackground`, like Telegram
  alerts): a slow or failing push service never slows or fails a booking.
  Failures are logged with the status code only, never the endpoint.
- A push service answering **404/410** means the browser dropped the
  subscription: the row is deleted at once. Ten other failures in a row
  delete it too.
- The scheduled ones ride on the pending-digest cron (every 10 minutes), at
  most 50 of each kind a run within a 10-second budget, each claimed in
  `notification_sends` before it is sent so overlapping runs never send
  twice.
- Signing out of either app removes that browser's subscription.
- Endpoints are checked against the known push services (Google FCM,
  Mozilla, Apple, Windows) before they are stored or called.

## Tests

Unit tests never send. E2E runs with `PUSH_FAKE=1` and a public key only
(`apps/e2e/.env.e2e`): sends are recorded in memory instead of reaching a
push service. The server refuses to boot with `PUSH_FAKE` in production.
