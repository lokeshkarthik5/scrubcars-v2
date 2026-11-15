# Repair & bodywork quotes (0076)

Dent or scratch? A customer shows the damage, Detlio writes a plain brief,
nearby garages send estimates, and the customer books a visit with one tap.

## The switch

`REPAIR_QUOTES_ENABLED=on` on the API (Vercel). Off unless set to exactly `on`.

While off:

- every route under `/users/me/repair-quotes`, `/vendors/me/repair-quotes` and
  `/admin/repair-quotes` is a 404; only `GET /repair-quotes/config` answers
  (`{ enabled: false, … }`);
- the customer's Home has no "Repair quotes" tile;
- the garage's Requests page shows visit requests only;
- admin's garage editor has no "Takes repair & bodywork quotes" card, and
  Requests has no Repair quotes tab.

A garage's switch (`vendors.repair_quotes_enabled`) stays as it was.

## What else it needs

| Env var | What for |
| --- | --- |
| `R2_DOCS_BUCKET` (+ the R2 account and keys) | Videos and pictures are private, in the job photos' bucket under `repair-quotes/<token>/…`. Without it the customer is told uploads are not set up. The bucket's CORS must let `https://detlio.com` and `https://www.detlio.com` PUT (it already does for car photos). |
| `OPENAI_API_KEY`, `AI_VISION_MODEL` | Detlio's brief from the pictures. Without a key the customer writes the brief by hand (the feature still works). |
| `REPAIR_QUOTE_AI_RATE_LIMIT` (default 20) | AI briefs per customer per hour. |
| `VAPID_*` / `EXPO_PUSH_ACCESS_TOKEN` | Optional: garages hear of a new request, customers of each answer. |

## Per garage (admin)

Garage editor → Hours & booking → **Repair & bodywork quotes** → "Takes repair
& bodywork quotes". It can only be turned on for a garage with a **free "price
on inspection" service** (Price on inspection, no fee — 0073): a visit is
booked as that service. The card also shows the last 30 days: how often the
garage was asked, how often it answered in time, and how many final bills
stayed inside its quote.

## The rules (`apps/server/src/lib/repair-quotes.ts`)

- Sent to the **5 nearest** garages that are listed to customers, take
  drop-ins, have the switch on and a free inspection service, within 50 km.
- Each garage has **4 of its working hours** to answer (the same clock as a
  paid booking's answer: it stops while the garage is shut), never later than
  an hour before the request closes.
- A request **closes 48 hours** after it is sent. A garage can't quote after
  its own deadline or once the request is closed; the customer can cancel any
  time while it is open. At most 2 open requests per customer.
- **Book a visit** goes through today's checkout (`POST /booking-intents`'
  own service) for the garage's free inspection service, at the garage: no
  fee, no Razorpay order (0073). The garage accepts it like any booking, sets
  the price with its final bill, and anything more goes through extra work.
- **"Final bills match quotes"**: a garage with at least 3 visits booked from
  its quotes that were done with a final bill, every bill inside the quoted
  range.

## Privacy

- The AI gets only the still pictures (frames taken on the phone from the
  video, and the customer's photos, re-encoded without metadata) and the
  customer's one line. Never a name, phone, address, place or id.
  `store: false`; nothing is logged but counts and timing.
- The video is uploaded as recorded, except that the place the phone wrote
  into it (ISO 6709 location in the `moov` box) is zeroed on the phone first.
- Garages never see the customer's name or phone; a booked visit carries
  them in the usual contact window. The media folder is an opaque token, not
  the customer's id.

## How to try it

1. Set `REPAIR_QUOTES_ENABLED=on` (and `R2_DOCS_BUCKET`, plus `AI_FAKE=1`
   locally if you have no OpenAI key).
2. In admin, give a live garage a service priced on inspection with no fee,
   then turn on "Takes repair & bodywork quotes" for it.
3. As a customer near it: Home → **Repair quotes** → pick the car, add a video
   or photo, write a line → Next → check the brief → Send.
4. As the garage: Requests → the repair quote card → Can do → Send quote.
5. As the customer: the request page shows the quote → Book a visit → pick a
   time → Book visit · Free.
6. Admin: Requests → Repair quotes.
