# Shine Score (0075)

A free AI cleanliness score from four car photos, and a "Your Shine went
46 → 92" card on finished bookings, scored from the garage's own before and
after job photos. Screens: `reference/mockups/ai-round/1-shine-score.html`.

## The switch

`SHINE_SCORE_ENABLED=on` (API environment). Off unless exactly `on`.

- Off: every Shine route but `GET /api/v1/shine/config` is a 404 before auth
  runs. The apps read `/shine/config` and show nothing: no Home tile, no
  booking card, no Issues → Shine checks tab. Finished jobs are not scored.
  The cron still deletes old scans (a deletion promise holds when off).
- On, it also needs `OPENAI_API_KEY` (and uses `AI_VISION_MODEL`, default
  `gpt-5.5`). Without a key a scan answers "try again" (503 `AI_UNAVAILABLE`)
  and uses up nothing. E2E runs with `AI_FAKE=1` (`FAKE_SCAN_READING`,
  `FAKE_JOB_READING` in `lib/shine-score.ts`).
- Photos are kept in the private bucket `R2_DOCS_BUCKET`. With it unset
  nothing is stored (the score still works).

Before switching on: the privacy policy needs a line that **car photos are
sent to OpenAI to work out the score** (pictures only, no names, phones,
plates or ids; `store: false`), kept privately for 30 days, then deleted.

## Rules (all in `lib/shine-score.ts`, twinned in `packages/core/src/shine-score.ts`)

- Signed in to scan. **3 free scans a day per customer** (IST day), counted
  on the server under a per-customer lock. A scan that fails (AI down,
  photos unreadable) uses none up; at most 10 tries a day in all.
- The phone re-encodes each photo (1280 px JPEG, no EXIF/location) and
  checks brightness and blur first; only the four pictures are sent, with a
  fixed line naming the areas. The request schema is `.strict()`.
- The AI gives each area 0–100 and up to 4 findings; the overall (the
  average), the summary line and what to suggest are worked out in code.
  Findings with numbers (plates) or banned words are dropped.
- Suggestions: the garage list's own nearest-first read (drop-in, 15 km when
  the phone sends its rounded location), each garage's best fitting wash
  (`pickService`), two shown, with Next free times.
- Finished jobs: on Mark completed / Delivered (in the background) and in the
  pending-digest cron (one a run, last 2 days, also a failed or stalled try
  that may go again; started after the digest's response so its AI call
  never holds the digest up), the garage's before and after
  photos of matching areas are scored (front = front, side = left/right,
  dashboard and seats = interior; at least 2 areas both times, else no
  score). Up to 3 tries. Every AI call has a 40 s limit (under the 60 s
  function), so neither a scan nor a job's scoring can outlast it. The customer's booking page asks and shows it.
- An after-score under 60 goes to Admin → Issues → Shine checks (New), for a
  person to mark Looks fine or Follow up. **Nothing marks down, strikes or
  pauses a garage on a score.**

## Data

- `shine_scans`: one row per scan (status, scores, findings, summary,
  photo keys). The row and its photos are deleted after 30 days by the
  pending-digest cron (`shineScoreService.sweep`, up to 50 a run within
  10 s). The keys are saved before the photos are written, and a row goes
  only once its photos are deleted, so no photo is ever left behind without
  a record. Deleting an account unlinks its scans in the same transaction
  and deletes them with their photos straight after; anything left is
  no one's and the next sweep deletes it. Photo keys:
  `shine-scans/<scanId>/<area>.jpg` (no customer id).
- `shine_job_scores`: one per finished booking (cascade with it): areas,
  before/after scores, findings, review status.

Optional belt and braces: an R2 lifecycle rule on the private bucket that
expires objects under `shine-scans/` after 31 days.

## Routes

- `GET /shine/config` (public)
- `GET /users/me/shine` · `POST /users/me/shine/scans` · `GET /users/me/shine/scans/:id`
  · `GET /users/me/shine/suggestions?need=&lat=&lng=` · `GET /users/me/shine/bookings/:bookingId`
- `GET /admin/shine-checks?show=new|looks_fine|followed_up` · `POST /admin/shine-checks/:id/review { outcome }` (super-admin)

Errors: 429 `SHINE_SCAN_LIMIT` / `SHINE_TOO_MANY_TRIES`, 503 `AI_UNAVAILABLE`,
422 `SHINE_UNREADABLE`, 400 `SHINE_PHOTO_INVALID`, 409 `SHINE_CHECK_REVIEWED`.
