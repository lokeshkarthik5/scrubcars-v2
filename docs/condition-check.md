# Car condition check at handover (0075)

A guided 8-angle walk-round when the garage takes the car. Detlio's AI marks
the scratches and dents already there, the garage removes a wrong mark (or
adds one it missed) and sends it, and the customer answers "Looks right" or
"Something's wrong". After the job the same angles are compared with the
before photos: a possible new mark warns the garage above Complete job and
is shown to the customer, who can raise a complaint. Nothing blames anyone.

Owner-approved screens: `reference/mockups/ai-round/3-condition-check.html`.

## The switch

| Variable | Default | What it does |
| --- | --- | --- |
| `CONDITION_CHECK_ENABLED` | `off` | `on` turns the check on for every garage. Off = the job photos exactly as before (5-slot checklist, no marks, nothing new on either app). |
| `CONDITION_CHECK_GARAGES` | empty | Comma-separated garage ids that have the check while the switch is off: a garage-by-garage roll-out (E2E uses it for its own garage). |
| `CONDITION_CHECK_READ_RATE_LIMIT` | `120` | Detlio's looks at car-check photos per signed-in garage person per hour (each is a paid vision request). |
| `OPENAI_API_KEY`, `AI_VISION_MODEL` | as today | The same key and model the garage import uses. Unset key = the check still works, with no marks: the photos are the record. |

The apps learn whether it is on from the booking payload: `conditionCheck`
is `null` while it is off for the garage.

## What happens

1. **Walk-round (garage app, job page).** With the check on, the before
   checklist is 8 big tiles: front, back, left side, right side and the four
   corners (corners are new angles on `job_photos.angle`). It replaces the
   5-slot checklist, so the garage takes one set. Each photo is read by
   Detlio as it arrives (`POST /vendors/me/bookings/:id/condition/photos/:photoId/read`,
   one photo at a time from the app's queue).
2. **Required for pickup & drop and doorstep** (the car leaves the
   customer's sight): Picked up (pickup & drop) and Start job (doorstep) wait
   for all 8 angles, sent to the customer (409 `CONDITION_CHECK_REQUIRED`).
   **Optional at the garage**, with the usual nudge. Detlio's photo waiver on
   a booking waives it too. Once sent, the check always satisfies the gate
   (Send held the job to its angles then), so undoing a waiver after a
   shorter check was sent never strands the job.
3. **Check the marks** (`/bookings/[id]/condition`): the photos with red
   circles and labels, Remove / Undo, "Add a mark Detlio missed", then
   **Send to customer**. Once sent the before car-check photos and their
   marks are fixed (no retake or removal: 409 `CONDITION_CHECK_SENT`).
4. **Customer** (booking page, under the status): "Your car's condition
   before the job" with the marks; **Looks right** (who and when are
   recorded) or **Something's wrong** (a short note the garage sees on its
   job page and the team sees on the admin booking). No answer holds nothing
   up.
5. **After the job**: each after photo of a walk-round angle is compared with
   the before photo of that angle. A possible new mark shows above Complete
   job ("It was there" answers it; it never blocks). Once the job is
   completed the customer sees "New mark found – …" with both photos,
   **Raise a complaint** (today's complaint form, about this booking,
   category "Damage to my car", filled in) and **It was already there**.

## AI and privacy

- Only the photos go to OpenAI, with fixed instructions: never a name,
  phone, address, plate, booking or id (`lib/condition-check-ai.ts`). The
  model is told never to write a plate or any text it reads, and the
  "where on the car" words are stripped of every digit (`cleanPart`).
- Strict JSON-schema output, checked again with zod; anything else is a
  failed read. `store: false`, 50 s timeout, no retry (`lib/ai.ts`).
- A failed read (or AI off) leaves the photo without marks. The job never
  waits on the AI.
- Logs carry counts and timing only.
- Tests and E2E never call OpenAI: `AI_FAKE=1` marks every car-check photo
  with one "Scratch – rear left door" and every after photo with one
  possible "Dent – rear bumper".

## Database (0075, additive)

- `job_photos.angle` CHECK widened with `front_left`, `front_right`,
  `back_left`, `back_right`; `job_photos.condition_read` (`done` / `failed`)
  and `condition_read_at`.
- `condition_checks`: one row per booking once sent (who, when), and the
  customer's answer, who, when and note.
- `condition_marks`: each mark (kind, where, 0-1 box, Detlio's or the
  garage's, unsure, removed), and for an after mark the before photo it was
  compared with and both sides' answers. Cascade with the booking and photo.

## Trying it

1. Set `CONDITION_CHECK_GARAGES=<a test garage id>` (or
   `CONDITION_CHECK_ENABLED=on`) on a preview API; `AI_FAKE=1` locally, or a
   real `OPENAI_API_KEY`.
2. Book a doorstep or pickup & drop job at that garage and accept it.
3. In the garage app open the job: take the 8 photos, tap **Check the
   marks**, remove/undo/add a mark, **Send to customer**; Start (or Picked
   up) unlocks.
4. In the customer app open the booking: **Looks right** or **Something's
   wrong**.
5. Start the job, take after photos; a possible new mark shows above
   Complete job. Complete it and open the booking as the customer.

## The native apps

Both native apps have the same screens, on the same endpoints and
`packages/core` rules, and learn the switch the same way (the booking
payload's `conditionCheck`):

- **Garage app** (`apps/vendors-app`): the 8-angle walk-round tiles in
  `components/job-photos.tsx` (rules in `lib/condition-view.ts`), the
  summary and the new-mark warning in `components/car-check.tsx`, Check the
  marks at `app/bookings/[id]/condition.tsx` (`components/check-the-marks.tsx`),
  the Picked up lines in `components/pickup-steps.tsx`, and Detlio's reads in
  `lib/condition-reader.ts`. Photos go through `lib/photo-prepare.ts`, which
  re-encodes them with expo-image-manipulator (dropping the location).
- **Customer app** (`apps/users-app`): `components/booking/condition-check-card.tsx`
  on the booking screen (rules in `lib/condition-check-view.ts`), with Raise a
  complaint prefilled through `components/complaints/raise-complaint-sheet.tsx`.
- The circles are `packages/native-ui/src/marked-photo.tsx`, the twin of
  `packages/ui/src/features/marked-photo.tsx`.

Only a build of the native garage app from before these screens (if one
ever reached a phone) would still meet 409 `CONDITION_CHECK_REQUIRED` on
Picked up / Start with the check on; `GET /app-config`'s minimum version is
the way to move such a build on.
