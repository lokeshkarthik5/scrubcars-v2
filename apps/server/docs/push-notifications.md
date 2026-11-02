# Browser notifications: setup

Garages hear about new bookings, and customers about their bookings, through
the browser's own notifications (Web Push). It is free: no SMS, no WhatsApp
approval. The native apps are a second kind of device on the same `notify` in
`modules/push/push.service.ts` (see "Phones (the native apps)" at the end).

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

## Phones (the native apps, migration 0067)

The Expo apps (customer and garage) get every notification a browser gets,
word for word (`lib/push-messages.ts`), through **Expo's push service**
(`https://exp.host/--/api/v2/push/send`, `lib/expo-push.ts`). Chosen over
calling FCM and APNs directly because the server then needs no Apple key or
Firebase service account: the app hands us an Expo token
(`ExponentPushToken[...]`) and Expo delivers.

- **Off until `EXPO_PUSH_ACCESS_TOKEN` is set.** Off means: the device routes
  answer 404 and no `push_devices` row is read or written for a send.
  Browsers are unaffected either way, and each kind works without the other.
- **Setup**: in the Expo dashboard, create an access token (Account settings
  → Access tokens), switch **Enhanced push security** on for the project
  (Project → Credentials/Notifications) so a leaked device token alone cannot
  push to our users, and set the token in the Vercel environment of the API
  (Production, and Preview if previews should send). Nothing else.
- **Routes**, beside the browser ones: `POST` and `DELETE`
  `/users/me/push/devices` (customer) and `/vendors/me/push/devices` (garage
  seat) with `{ token, platform: 'ios' | 'android' }` / `{ token }`. The token
  is in the body, never the URL. Same audience, tenant and support-session
  rules as `/subscriptions`; the customer's two switches (Booking updates,
  Reminders) apply to phones too.
- **Table**: `push_devices` (token unique, platform, user, audience, garage
  for garage seats). `push_subscriptions` is untouched. At most 10 phones per
  person per app, the newest. Deleted with the account.
- **Cleaning**: Expo answering `DeviceNotRegistered` deletes the row at once;
  ten other failures in a row delete it too; a token that is not an Expo
  token is deleted and never sent. Receipts (Expo's second step, ~15 minutes
  later) are not read yet.
- **A phone never breaks a browser**, nor the reverse: each kind is sent and
  logged on its own, and a failing phone send is logged (by name and
  status, never a token) and dropped.
- **Tests**: `PUSH_FAKE=1` records phone sends in memory
  (`fakeDeviceOutbox`) instead of calling Expo; unit tests pass a canned
  `fetch`.
