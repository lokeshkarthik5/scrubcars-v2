# Customer app UI round (November 2026)

The owner approved every screen below in mockups between 8 and 9 November 2026. This document is the source of truth for the build and for any future customer screen. Garage app and admin are **out of scope** (separate PRs later); the new look must be switched on for `apps/users` (and later `apps/users-app`) only, never leaking into `apps/vendors` or `apps/admin`.

## Approved mockups (local files on the owner's Mac; read them, they are working HTML)

| What | File | Notes |
|---|---|---|
| Bottom bar | `~/Desktop/Detlio-Dev/reference/mockups/red-glow/red-glow.src.html` | **F** (ring of light on the active tab) + **H silver** (other icons silver, pearl +). Ignore the other looks on that page. |
| Map screen | `~/Desktop/Detlio-Dev/reference/mockups/map-glass/map-glass.src.html` | Chosen: `data-pin="prem"` premium marker (red dot, white ring, glass label "name / ₹price · km · ~min"), `data-fx="route"` (Route draw), `data-arc="arc"` (3D arc + red ground shadow), `data-mark="dot"`. Ignore: other effects (spring, reticle, spot, fly, beam, wave, halo), Light wall, Flat, the 3D "D." marker, the old box pin and pulse looks. |
| Garages list, garage page, booking page | `~/Desktop/Detlio-Dev/reference/mockups/garage-list/garage-list.src.html` | Final state = `data-top="map" data-sw="key" data-ctl="sheet" data-red="b"`, list `data-card="show"`. Everything else in that file (tiles, Mercury, Headlight, Dial, Previous rail, clean type, one panel, Spec sheet, Glass card, the Top/Mode/Card/Red switches) is superseded — do not build it. Debug hashes in the file (`#still`, `#mid-…`) are mockup-only. |
| Special moments for the other screens | `~/Desktop/Detlio-Dev/reference/mockups/moments/moments.html` | 13 approved moments (the light-up stars were dropped; moment 12, the receipt printing from a slot, was removed by the owner on 9 Nov). |
| What today's booking details page shows | `~/Desktop/Detlio-Dev/reference/mockups/garage-list/inventory-booking-details.md` | Every status, card and sheet must survive. |

**Rule: nothing on today's pages is removed** unless this document says so. Every state, empty state, error, sheet, sign-in path, notice and copy string keeps working; only the look and the listed additions change.

## 1. The finish (shared rules)

Put these in one place (Tailwind theme tokens / CSS variables + a few shared components in `packages/ui`) and use them on every customer screen, including screens without a mockup.

**Type scale (Inter for words, Space Grotesk only for figures):**
- Page title 24/600, −0.02em (garage name on the garage page).
- T2 18/600, −0.01em — section titles, card titles.
- T3 15/500 — main text, search, sheet options, "All services"-type values (600 for emphasis).
- T4 13/500 — controls (600 when active/selected).
- T5 11/500 — small print, captions, **bottom-tab labels** (active 600).
- Overline 10/600, uppercase, +0.1em — small labels ("SERVICE", "NEXT FREE").
- Figures (prices, km, minutes, counts, ratings): Space Grotesk 600, tabular numbers. The status-bar-style clock and normal words never use Space Grotesk.

**Layout:** two-line controls 56px high (main line 14/600 over quiet line 11/500 — e.g. "At garage / Drive it in", "All services / 5 garages", "Silver+ / Silver & Gold"); one-line controls 40px; pinned (sticky) controls shrink to 44px and hide their quiet line. Corners: 22 big surfaces (cards, map card), 18 controls, 14 inside a control, 12 small buttons; full pills only for small chips/badges on photos. Spacing rhythm: 8 inside a group, 24 between groups, 4 under a heading. Side gutter 16.

**Materials:**
- Edges catch the light: gradient borders, bright on top fading down (`padding-box` fill + `border-box` gradient), no flat grey outlines.
- Things you press are raised (lighter gradient + soft shadow); things you type into, and switch tracks, are recessed (dark top edge, light bottom edge, inset shadow).
- Glass (blur 20–24px, saturate 1.6, faint white gradient, 1px light edge) for bars and sheets that float over content.
- Pearl white (radial white gradient) for the selected category tile, the ↗ on garage cards and the + in the bottom bar. **No shine/sweep animation on any pearl or button, anywhere** (owner rejected it).
- A faint red glow at the very top of screens (radial, ~8–10% red).

**Red, exactly two ways:**
- **Red light** = a small glowing red bar/LED (2.5px, `#ff2d4a`, glow) under the chosen thing: the graphite mode switch key, picked times/days, chosen car/address tiles, Added buttons (dim 28% light waiting under every Add, red "+", fully on when added), tab underline. 
- **Solid red button** (gradient `#ff3550 → #E4002B → #c10025`, white text, red glow shadow) only for the booking/payment action on a screen: Book now, Add to booking, Pay ₹X, Book (quick look), Confirm reschedule, Pay final bill, Approve & pay.
- Never big red blocks or red text for body copy.

**Icons:** one line weight — every line icon renders at 1.6px regardless of size (active tab 1.9px).

**Motion rules:** one-shot effects only (no infinite decorative loops; a spinner while waiting is fine); usually under ~0.6s; exits faster than entrances; spring easing for presses (scale 0.96–0.97 and back); transform/opacity/clip-path only; every effect off under `prefers-reduced-motion` (content still appears, instantly). Numbers that change roll like an odometer.

## 2. Bottom bar (HubNav)
F + H from the red-glow mockup: active tab = graphite orb with the ring of light, other icons silver, pearl + in the middle (no sweep). The ring turns, as the mockup shows (red spectrum clockwise every 7s, white light the other way every 3.4s; still under reduced motion): the one decorative loop the motion rules allow. Labels follow T5 (11/500, active 600). Glass bar.

## 3. Garages list (`/garages`, and `/home` while the hub is off)
Build exactly the mockup's final state:
- Header: Detlio logo (red dot with soft glow) + location as a one-line raised pill ("📍 Adyar ⌄"), recessed search field whose hint rolls through real searches ("garages or services", "foam wash", "ceramic coating", "interior cleaning", "scratch removal"; stops under reduced motion).
- **Map peek** card under search: a small dark map of the customer's area in 3D tilt with every garage of the current mode as a red dot (dots drop in one after another on open), the customer as a white dot, the nearest garage tagged with its km; "N garages near you" + "Map ↗" glass chips; tap opens `/map` with the same mode/category. Tilts a little further and parallaxes on scroll. Use real coordinates (MapLibre with a static, non-interactive style, or a projected canvas — whichever is lighter; it must not slow the screen: lazy-load it after the list).
- **Mode switch** (At garage / Doorstep / Pickup & drop): recessed track, raised brushed-graphite key that slides with a small liquid stretch, red light under the chosen one once it settles; quiet line "Drive it in / We come to you / We collect it". Only modes that exist.
- **Filter row**: "All services / N garages" raised button with a pearl icon tile → glass **filter sheet** with service tiles (2 columns, live counts, tiles rise in one by one; tap applies and closes) + a "Silver+ / Silver & Gold" key that turns brushed silver with a coin-flip of the medal and a glint when on (only when the tier filter is offered). The mode switch + filter row pin to the top on glass when scrolling (heights shrink to 44).
- Heading "Nearby garages" (no count badge; the count lives in the filter) + Sort as a 40px raised button; "Nearest first from {area}" caption.
- **Showroom garage card**: swipeable photos (all `vendor.photos`, dots stretch), name + tier medal + NEW tag (for new garages) on the photo over a shade, "{area} · Known for {knownFor}" (or services), open/closed glass chip with the **opening-hours ring** (share of today's hours left), heart; facts row rating | km + "~N min drive" | ₹ starting price (**count up** when the card scrolls into view), pearl ↗; a **road** on the hairline between photo and facts (you → garage) where a small car drives to the garage while the distance counts up; "Comes to you too" / "Can collect your car" chips; **Next free** row ("NEXT FREE · TODAY|TOMORROW" + the next three times as buttons; tap picks a time → opens booking with it). Card leans slightly toward the pointer (no white sheen), photos drift slightly on scroll. Removed: the "New on Detlio" fact column (→ NEW tag), "per wash"/"Packages too" (→ "starting price"), the "At garage" badge on the At garage tab.
- **Press and hold** a card (450ms) → quick look: card lifts, glass panel flies to the centre with photo, area/km/min, top 3 services with time and price (from the garage detail query), "Open garage" and red "Book".
- Compact card variant stays available in code for very long lists but is not the default.

## 4. Map screen (`/map`)
Map-glass mockup: glass top bar (Back, List opens the pull-up list sheet, Recentre), the cards strip with peeking next card + edge buttons + "1 of 6" pager + "6 garages near you" pull-up list (the five discoverability ways), glass bottom bar. Chosen garage marker = premium red dot + glass label; selecting a garage plays **Route draw** once (line from you to the garage, light at its tip, dot pops as it lands). The route is a **3D arc** with a blurred red ground shadow (MapLibre has no 3D line: draw a screen overlay projected from map coordinates on every move, or a custom layer). Camera glides 560ms. Distances/times use the existing drive-time rule.

## 5. Garage page (`/garage/[id]`)
- **Open from a card = container transform**: the whole card grows into the page (clip from the card's rect to full screen, page content aligned to the card top, hero scales .93→1, 540ms `cubic-bezier(.05,.7,.1,1)`), list sinks to .94 and dims. Back = exact reverse (420ms, page folds into the card's rect, real card fades back in). Nothing drawn twice. Use the View Transitions API (React `<ViewTransition>` / `document.startViewTransition`) with a shared name on the card and the page container, falling back to an instant switch where unsupported.
- Content (everything today's page has, see the garage section of the mockup): tall swipeable hero with back/heart on glass; name (24/600) with the opening-hours ring and "Open · closes 9 PM"; rating, km + drive time; area chip and tier seal + "What this means"; the road from you to the garage; the graphite mode switch (≥2 modes) + pickup note; next free times; tabs Services / Photos / Reviews (N) with a flowing red light line, sticky on glass; Services: recessed search, packages (included ticks, struck price, silver "Save ₹X", duration, Add), services (thumb, name, 2-line description, duration, price, "for your {model}"), add-ons (info only, with the note); service details sheet (glass, "What's included", price by vehicle, solid red "Add to booking"); Photos grid; Reviews summary + cards with garage reply. Withdrawn notice, slot alerts, paused state, outside-city line all kept.
- **Add** = red-light button (red +, dim light waiting) → "✓ Added" with the light on, tick draws, a small dot flies to the booking bar. **Booking bar** (glass, rises when ≥1 picked): "N services · duration", total (odometer), solid red **Book now ↗**.
- Scroll: hero drifts slowly; a glass top bar with the garage name takes over.

## 6. Booking page (`/book/[vendorId]`)
Built only from the parts above (mockup "booking page" section): opens from Book now by the glass booking bar growing into the page (Back folds it back). Summary card (list-card edge, × remove when 2+ lines, duration · mode); graphite mode switch + pickup note; addresses as two-line tiles with the red light (+ Add another address → existing sheet, restyled glass); "When?": day buttons (Today/weekday + number, closed days disabled, "More" calendar) and times as the next-free buttons with the red light on the pick, times slide in on day change, "Show afternoon and evening", notice line, every empty-day message, "Notify me if one opens"; cars as two-line tiles with the red light + dashed "Add another car" (glass sheet); add-ons with the red-light Add; Savings: "Coupons and offers" row (green % tile) + one-tap offer chips + coupon sheet + Detlio credit switch (₹1 rule); "To pay" card (green discount/credit lines, total odometer); cancellation policy; glass bottom bar: summary + total, "Free cancel until the garage accepts" (+ Guarantee line when it applies), CTA grey with the missing step ("Pick a time", "Choose an address", …; tap scrolls to it and nudges) → **solid red "Pay ₹X ↗"** with a small pop when ready; Razorpay/terms lines; busy states ("Processing payment…", "Payment received, confirming your booking…"). Guest sign-in card and every error toast kept.

## 7. Approved special moments for the other screens (moments mockup)
1. **Ignition** (after paying, replaces the confetti `SuccessBurst` on `?celebrate=1`): the Pay button's red light runs out along the bottom like an LED strip, screen dims, a tick draws in a red-lit ring, the booking card rises with the road and the car parked at "Requested". Same copy as today ("Booking requested / Waiting for…", "Booking confirmed / …").
2. **The road is the progress bar** (booking details, every status): the 4-step bar becomes stops on the road; on status change the car drives to the next stop; the garage pin flashes like headlights on Accepted; at Done the pin becomes a green tick. Pickup uses its own 6 steps on the same road. Hidden when moved/cancelled/missed (as today).
3. **"They answer by" ring** while waiting: drains like the hours ring with minutes left.
4. **Car photo shutter**: adding a "Your car's condition" photo blinks the tile like a camera shutter, then the photo fades in. Five slots in a row (Front, Back, Left side, Right side, Interior).
5. **Ticket card** (Bookings tab): the next booking at the top as a ticket (notched edges) with a live countdown (days/hours/min) and the small road for its status; past bookings as a compact list.
6. **Pull to refresh** (Bookings and lists): the little car rolls in as you pull, drives off as it refreshes.
7. **Dashboard start-up** (Home): "days since last wash" gauge whose needle sweeps once and settles; uses the existing wash-status rule (14 days default, 10 in Oct–Dec, customer can change).
8. **Real number plates** (Profile cars and car tiles): plates styled like Indian number plates (IND band).
9. **Garage cards in metal** (rewards/Detlio Garage): brushed silver/gold finish, points count up like an odometer, level bar fills; the existing card flip and scratch card stay.
10. **Code boxes that light up** (sign-in OTP): each typed digit lights the red light under its box; on the sixth a light sweeps across and the boxes merge into one tick.
11. **Search**: results rise in; matched words underlined with the red light.
12. ~~**Receipt prints** out of a slot, line by line.~~ **Removed by the owner on 9 Nov 2026**: the receipt is Detlio-styled instead (the finish: a dark card with the lit edge, the wordmark, overline section titles, figures in Space Grotesk 600, hairlines, the net amount a size up with one red light under it) and still, with no motion. Printing / the PDF stays the plain white paper document (web `print:` styles; native `lib/receipt-html.ts`, unchanged).
13. **Updates**: new items carry a small red light that fades once seen.

All other customer screens (Profile and its sub-pages, help/FAQ, legal, slot alerts, complaints, guarantee claim, reschedule/cancel sheets, final bill, extra work, suggested times, scratch card, pickup/delivery codes, receipt page (see 12), landing page list) get the finish only — same content and behaviour.

## 8. Speed (owner: "make sure the loading time & everything is fast & smooth")
Causes found in the code (9 Nov): ~10 requests start only after the garage page mounts; every GET pays a CORS preflight because the client always sends `Content-Type`; nothing from the list is reused; `/vendors/:id` runs ~11 queries with 7 sequential round trips (tier queries awaited one by one); the vendor is looked up 7 times per open; reviews are unbounded; the DB connection closes after 20s idle; no cache headers; `/bookings/[id]` polls with a bare interval even in hidden tabs. Indexes are fine; no migration needed.

Fixes (do all, keep every existing response shape — API changes only add):
1. `packages/core/src/api/client.ts`: send `Content-Type: application/json` only when there is a request body (removes the preflight on GETs).
2. `apps/users/app/garage/[id]/loading.tsx` skeleton in the new finish; seed `garageQuery` with `placeholderData` from the list/map vendor caches so hero, name, rating, km paint instantly; start the garage queries on pointer-down/hover of a card (`queryClient.prefetchQuery` + `router.prefetch`).
3. Stop the separate `/services` call: map `vendor.services` (already in `/vendors/:id`) with `mapService`.
4. Server: run the tier/holding queries in parallel (`Promise.all`) in `customerTiers`/`holdings`/agreements; fetch the vendor once per request where a handler repeats the public-vendor lookup (internal refactor only).
5. `apps/server/src/db/index.ts`: raise `idle_timeout` to 240s (keep `max` from env).
6. `Cache-Control: public, max-age=30, stale-while-revalidate=300` (browser only, no `s-maxage`) on public vendor reads: `/vendors/:id`, `/packages`, `/add-ons`, `/working-hours`, `/closures`, `/reviews/vendors/:id`, and the new next-free endpoint (`max-age=60`).
7. On `/garage/*` start `garageQuery` in parallel with the session check instead of after it (public data needs no session).
8. Reviews load when the Reviews tab is opened (count already known); travel time seeded from the list's coordinates.
9. `/bookings/[id]`: move to `useQuery` with `refetchInterval: 5000` (pauses in hidden tabs), seeded from the bookings list.
10. `/book/[vendorId]`: reuse the garage cache (longer `staleTime`, e.g. 5 min) so opening booking is instant.

## 9. Next free times (new, adding only)
`GET /vendors/next-free?ids=a,b,c&bookingType=dropin|doorstep|pickup` (max 20 ids, public) → `{ success, data: { [vendorId]: { day: 'today' | 'tomorrow' | 'YYYY-MM-DD', times: string[] /* up to 3 ISO starts */ } | null } }`, computed with the same slot logic the booking page uses (reuse the slots service; respect notice periods, closures, capacity), `Cache-Control: public, max-age=60`. The list asks for the visible cards in one batch (debounced), never one request per card. Tapping a time opens `/book/{id}?…&slot=<iso>` and the booking page pre-selects that day and time if it is still free (otherwise its normal toast).
