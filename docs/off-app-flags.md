# Off-app payment flags ("Flagged by Detlio")

Detlio's own checks add entries to admin's **Bypass reports** page, next to customers' reports. Built Nov 2026 (migration 0075); the rules are in `apps/server/src/lib/off-app-flags.ts`.

## The switch

`OFF_APP_FLAGS_ENABLED=on` in the API's environment (Vercel). Anything else, or unset, is **off** (the default):

- the checks never run;
- the Bypass reports list and its counts leave flags out, the filter row and **Check now** are hidden, and the page is exactly as before.

Turning it off later hides flags again. A flag someone already confirmed keeps counting as a strike, like any confirmed report.

## When the checks run

- Every morning at **07:00 IST**, on the existing pending-digest cron (`POST /api/v1/ops/pending-digest`, its morning tick). There is no new cron.
- Any time from admin: **Bypass reports → Check now** (`POST /api/v1/admin/bypass-reports/flags/check`, super-admin; 404 `OFF_APP_FLAGS_OFF` while off).

Each flag is written **once**: every flag has an evidence key with a unique index, so running the checks again never makes a duplicate.

## What can flag a garage

| Signal | What it means | Thresholds |
|---|---|---|
| **Phone number or UPI ID in a note** | A note from the garage that the customer sees has a mobile number, a UPI ID (`name@bank`), or wording like "pay directly", "book directly", "call me directly", "without the app". | Notes written in the last 3 days (the garage's reason for declining or cancelling, its final bill and extra work notes and lines, the note with its suggested times). |
| **Regular customers went quiet** | Repeat customers stopped booking the garage. | A repeat customer completed 2+ bookings there in the last 180 days. Stopped = no booking there for 30 days (whether or not they still book elsewhere). Flagged at **5+ stopped who are 30%+** of its repeat customers. At most one such flag per garage every 30 days. |
| **Cancelled after inspection, same customer** | The garage looks at the car, the booking is cancelled with no final bill paid, again and again with the same customer: the job agreed face to face and paid outside. | **3+** such bookings (with an on-inspection service, accepted by the garage, cancelled, no paid final bill) between the same customer and garage in 90 days. A new flag at every third. |

Softer notes ("GPay", "next time call me", "cash") are not flagged by the patterns alone. When OpenAI is set up (`OPENAI_API_KEY`), up to 10 a run are sent to it with **every number and UPI ID masked and no names or booking details**, asking only yes or no; only a plain "yes" makes a flag. With AI off they are left alone.

## What the team sees

Each flag shows a **Flagged by Detlio** tag, "What happened", the booking (or "—" for a garage-level flag), the customer (the booking's, or the run's; "N customers" for regulars), "Reward: None (Detlio flag)", and an **Evidence** block: the note with numbers masked (`98•••• •4210`), the quiet customers with their last booking, or the cancelled bookings, each a link.

A second filter row, **All / Customer reports / Flagged by Detlio**, sits under New / Confirmed / Dismissed (`?from=all|customer|detlio`).

**Confirm** and **Dismiss** work exactly as for a report: Confirm adds a strike (and can reach the 2-strike alert); Dismiss needs a reason.

## What flags never do

- **Never punish on their own.** A flag lands as New; only a person's Confirm makes it a strike.
- **Never a reward.** There is no reporter (`user_id` is null, CHECK), so confirming pays nobody.
- **Never block a customer's own report** of the same booking (a flag has no chain, CHECK).
- **Never tell the garage**, as with customer reports.
- **Never read Garage Book** (the garage's own `garage_*` tables: its customers, jobs and money), by the owner's rule, to keep garages' trust.
- **Never store a full phone number.** The evidence keeps the note with numbers masked.

## Data

`bypass_reports` gains (0075, additive): `source` (`customer` | `detlio`), `signal`, `evidence` (jsonb), `evidence_key` (unique where set). `booking_ref` may be empty for a garage-level flag only (CHECK).
