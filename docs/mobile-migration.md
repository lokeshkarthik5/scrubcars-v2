# Detlio mobile migration plan

**Scope: customer app + garage app only. Admin stays web.**

---

## Goal

Ship native apps for customers and garages that talk to the existing
`api.detlio.com`, while detlio.com / vendor.detlio.com keep working for
discovery, onboarding, legal, and deep links.

| App | Code | Store role |
| --- | --- | --- |
| Customers | `apps/users-app` (Expo) | Day-to-day book / track / pay |
| Garages | `apps/vendors-app` (Expo) | Day-to-day jobs / photos / push |
| Admin | — | Not in this plan |

---

## Principles

1. **One API** — no mobile-only business logic fork; rules stay in
   `apps/server` + `@repo/core`.
2. **Same session model as web** — short-lived **access** JWT + long-lived
   **refresh** token (hashed in `refresh_tokens`).
3. **Native storage** — tokens in **SecureStore** (iOS Keychain / Android
   Keystore-backed). Never AsyncStorage for secrets.
4. **Web is not deleted** — dual-run; apps become the habitual surface.
5. **Vendors first, then users** — smaller audience, push + camera critical.
6. **No WebView shell** of the Next apps for the core product loops.
7. **`@repo/core` shared** for API/types/stores; UI rebuilt in React Native
   (`@repo/ui` stays web).

---

## Auth (shared foundation)

**Web today:** HttpOnly cookies, `credentials: 'include'`.

**Apps:**

- After OTP verify / refresh: write access + refresh into SecureStore.
- Requests: `Authorization: Bearer <access>` (plus `X-Vendor-Id` on garage
  calls).
- Cold start: read refresh → `/auth/refresh` → new pair → SecureStore.
- Logout: clear SecureStore + existing logout endpoint (invalidate refresh
  row).
- `@repo/core` `api/client.ts`: transport adapter — cookie mode (web) vs
  Bearer + SecureStore (native).

Audiences unchanged: `customer` vs `vendor`. Admin auth untouched.

**Token storage**

| Token | Where | Notes |
| --- | --- | --- |
| Refresh | SecureStore (required) | Stay signed in across launches |
| Access | SecureStore or memory-only | Memory-only means refresh on every cold start |

Do not store tokens in AsyncStorage, MMKV without encryption, URLs, logs, or
deep-link params.

---

## Push

- Keep Web Push for browsers.
- Add FCM/APNs via the existing `PushSender` hook in `lib/web-push.ts`.
- Store device tokens (not VAPID endpoints) for app installs.
- Reuse `lib/push-messages.ts` copy; same preference switches where they
  already exist.

---

## Payments (customers)

- Razorpay native SDK (or verified in-app browser return).
- Same create-order → checkout → `/payments/verify` contract; webhook remains
  source of truth.
- Meta Pixel / CAPI stay web-only; in-app analytics = existing first-party
  `POST /events` only.

---

## Deep links

Universal Links / App Links for both apps, at least:

**Customers:** `/bookings/:id`, `/book/:vendorId`, `/c/:code`, `/gift/:code`,
`/invite/:code`, Home/Updates targets.

**Garages:** job deep links equivalent to `/bookings?tab=…#job-:id`.

Website remains the fallback when the app is not installed.

---

## Versioning

Nothing is deferred off the product. Features ship in named app versions.
Garage app first, then customer app. Store version numbers follow each app’s
`app.json` / EAS submit (examples below are product labels, not store build
numbers).

---

## v0 — Foundations (both apps)

- Monorepo wiring: Expo apps + `@repo/core`, env, EAS, bundle IDs, URL schemes.
- Bearer auth + SecureStore + session restore / refresh / logout.
- Dev builds (not Expo Go once native modules land).
- Push token registration (FCM/APNs path ready for v1.0).
- Feature flag / store-readiness gate.
- Confirm CORS / client expectations for native requests.

---

## Garage app

### v1.0 — Jobs

Ship first.

- OTP login, session restore, garage switch
- Home + Bookings lists (Today / New / Later / Done)
- Job page: Accept, Decline, Suggest times, Start, Complete + Undo
- Pickup steps + customer codes (codes never logged)
- Job photos: camera → strip EXIF/GPS → private R2 (same consent rules)
- Native push: new booking, respond-soon, and the rest of today’s garage
  push set
- Extra work + final bill **create** (customer pays in their app/web)
- Settings: notifications, basic account, delete my account / leave garage

### v1.1 — Business

- Earnings statement + payout view (owner seat)
- Documents upload / review status (private R2)
- Garage agreement: read PDF + accept
- Full onboarding wizard
- Services & packages management, including service photos and video
- Reviews list + reply (owner seat)
- Guarantee claims inbox (accept / dispute)
- Visit requests inbox (accept / decline / withdraw)

### v1.2 — Polish

- Soft “Open in app” / install prompts from vendor.detlio.com where useful
- Optional biometrics gate before reading SecureStore
- Any remaining portal parity with vendor.detlio.com

---

## Customer app

### v1.0 — Book & track

- Area / location → garage list → garage → services → checkout
- OTP (including guest checkout sign-in parity)
- Map modes and search on par with the website
- Razorpay pay → booking detail
- Contact window (phones only when open)
- Home hub (must-act / rate / car / next booking)
- Updates + native push (booking updates + reminders)
- Profile: cars, addresses, notifications, **delete account**
- Coupons: type code + camera scan
- Saved garages
- Slot alerts
- Complaints (raise, list, withdraw)
- Guarantee: claim, redo booking, status

### v1.1 — Loyalty & gifts

- Detlio Rewards (stamps, scratch cards, vouchers, levels, invite)
- Achievements, challenges, Detlio Wrapped (including share images)
- Detlio Garage collectible cards (album, pull reveal, share)
- Gifts: buy, share, redeem, Detlio credit (when `GIFTS_ENABLED` is on)
- Free-wash area sign-ups, recommendations, booking requests
- Service history certificate + share / verify flow from the app

### v1.2 — Polish

- Soft “Open in app” from detlio.com where useful
- Optional biometrics gate before reading SecureStore
- Any remaining parity with detlio.com customer surfaces

---

## Steady state

- Apps = default for booked customers and active garages.
- Web = SEO, landing, legal, shareable links, and anything that must work
  inside WhatsApp/Instagram browsers without an install.
- No hard shutdown of user/vendor web without clear app adoption.

---

## Backend work (early, supports both apps)

| Area | Work |
| --- | --- |
| Auth | Accept Bearer access; refresh returns tokens usable by native; same JWT `aud` |
| Push | FCM/APNs sender + token storage beside Web Push |
| Client | Cookie vs Bearer adapter in `@repo/core` |
| Uploads | Existing presigned R2; native EXIF strip before PUT |
| Analytics | First-party events only in-app |

Schema changes stay additive; migrations are run manually. Admin modules
unchanged.

---

## What stays on the websites

- Customer landing, search/SEO, legal
- Public verify / gift / coupon / invite when the app is not installed
- All admin
- Link targets that must open without an install

Web remains a full fallback; the apps take feature parity by version, not by
leaving product on web-only.

---

## Risks

- Auth transport (cookies → SecureStore + Bearer) is the critical path —
  finish in v0.
- Razorpay native must not diverge from webhook settlement.
- iOS push needs Apple credentials and real devices.
- Two UIs (web + app) — keep domain rules in `@repo/core` so screens stay thin.
- Do not expand this plan to admin.

---

## Decisions to lock before build

1. Store listing names (e.g. “Detlio” / “Detlio for Garages”).
2. Minimum iOS / Android versions.
3. Customer app: full guest browse like web, or sign-in earlier.
4. Access token: persist in SecureStore vs memory-only + refresh on launch.
5. Exact store version numbers / EAS channels for v1.0 vs v1.1 vs v1.2.

---

## Done when

- Garage app through **v1.2**: full portal parity (jobs, money, documents,
  onboarding, media, reviews, guarantee, requests).
- Customer app through **v1.2**: full customer parity (book/pay/track, loyalty,
  gifts, reach, certificates).
- Web still covers acquisition and links without an install.
- Admin never required a mobile client.
