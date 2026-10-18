import 'dotenv/config'
import { isDataResetEnabled } from './data-reset.js'
import { parseDailyCap } from './refund-sending.js'
import { isAutoCancelOn, parseResponseMinutes } from './response-deadline.js'
import { isPushConfigured } from './push.js'
import { parsePhotosRequired, parseRequiredGarages } from './job-photo-standards.js'
import type { GeoProviderName } from './geo/types.js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

/**
 * Whether to fake the payment gateway instead of calling Razorpay.
 *
 * Checkout is online-only: a booking is only ever written by verifyPayment,
 * which means an automated test cannot create one without either hitting the
 * real gateway or standing in for it. This flag does the latter — see
 * lib/razorpay.ts, where it mints `order_e2e_*` order ids locally and accepts
 * exactly those ids at signature-verification time. Every other order id still
 * goes through the real HMAC check.
 *
 * It is refused outright in production rather than merely defaulting off, so
 * that a leaked value in a deploy environment fails the boot instead of
 * quietly making every payment free.
 */
function readFakePaymentsFlag(): boolean {
  const enabled = process.env.E2E_FAKE_PAYMENTS === '1'

  if (enabled && process.env.NODE_ENV === 'production') {
    throw new Error(
      'E2E_FAKE_PAYMENTS is set in production. This disables payment ' +
        'signature verification and must never be enabled outside tests.'
    )
  }

  return enabled
}

/**
 * A test-only switch that stands in for an outside service (STREAM_FAKE,
 * AI_FAKE). Refused in production for the same reason as E2E_FAKE_PAYMENTS:
 * a leaked value in a deploy environment must fail the boot, not quietly
 * stop videos reaching Stream, put the same sentence on every garage's
 * services or hand every admin the same test picture.
 */
function readTestFake(name: string, what: string): boolean {
  const enabled = process.env[name] === '1'

  if (enabled && process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is set in production. It ${what} and must never be enabled outside tests.`)
  }

  return enabled
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: requireEnv('DATABASE_URL'),
  e2eFakePayments: readFakePaymentsFlag(),
  jwtSecret:
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === 'production'
      ? requireEnv('JWT_SECRET')
      : 'dev-jwt-secret-change-me'),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  refreshTokenExpiresDays: Number(
    process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '30'
  ),
  /**
   * Origins allowed to call this API with credentials.
   *
   * Each frontend is its own deployment on its own host and calls this API
   * directly, so every one of them needs a seat here — including the three
   * local dev ports (users 3000, vendors 3001, admin 3002).
   *
   * The session cookies stay SameSite=Lax and host-only on the API domain:
   * detlio.com, vendor.detlio.com, admin.detlio.com and api.detlio.com share
   * the registrable domain detlio.com, which makes these requests same-site,
   * so Lax cookies are sent without needing SameSite=None.
   *
   * Preview deployments are the exception — *.vercel.app is on the Public
   * Suffix List, so each preview URL is a different site and its cookies would
   * be dropped. Previews route through their own app's /api/v1 proxy instead,
   * which is why no *.vercel.app origin is listed here.
   */
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'https://detlio.com',
        'https://www.detlio.com',
        'https://vendor.detlio.com',
        'https://admin.detlio.com',
      ],
  smsApiKey: process.env.SMS,
  // ─── Ops alerts ────────────────────────────────────────────────────────────
  // A Telegram bot that posts booking events (new paid booking, refund due,
  // decline, cancel, reschedule) into the Detlio team's group. Both unset —
  // as in development, E2E and previews — turns alerts off and nothing else
  // changes. The token is a password for the bot: Production only.
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramOpsChatId: process.env.TELEGRAM_OPS_CHAT_ID,
  // Alerts go out from the Production deployment only, whatever else is set:
  // a preview, `vercel env pull` or a local .env holding the token must never
  // post test bookings to the real team. OPS_ALERTS=on overrides that for a
  // deliberate local test.
  vercelEnv: process.env.VERCEL_ENV,
  opsAlertsForced: process.env.OPS_ALERTS === 'on',
  // How many test alerts (admin → Alerts → Send test alert) each admin may
  // send an hour. A test posts to the real team chat, so a stuck button or a
  // script must hit a wall.
  telegramTestRateLimit: Number(process.env.TELEGRAM_TEST_RATE_LIMIT ?? '5'),
  // ─── Browser notifications (Web Push, lib/push.ts, 0044) ──────────────────
  // Garages hear about new bookings and customers about theirs through the
  // browser's own notifications (free). One VAPID key pair for the API,
  // made once with `bunx web-push generate-vapid-keys` (docs/push-
  // notifications.md): the public key goes to browsers when they subscribe,
  // the private key signs every send and lives only in the Vercel
  // environment. VAPID_SUBJECT is how a push service can reach us
  // (mailto:support@detlio.com). Any of the three unset — as in development
  // and previews — and notifications are off: every push route but /config
  // is a 404, the apps hide the Notifications screens and nothing is sent.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY?.trim() || undefined,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY?.trim() || undefined,
  vapidSubject: process.env.VAPID_SUBJECT?.trim() || undefined,
  // E2E only: sends are recorded in memory instead of reaching a push
  // service (lib/web-push.ts), so the suite can switch the feature on with a
  // public key alone. Refused in production.
  pushFake: readTestFake('PUSH_FAKE', 'records browser notifications instead of sending them'),
  // ─── Crash reporting ───────────────────────────────────────────────────────
  // Sentry's project key for this API. Unset — as in development, E2E and
  // previews — and nothing is reported or even loaded (see lib/monitoring.ts).
  // Set it in the Production environment only.
  sentryDsn: process.env.SENTRY_DSN || undefined,
  // Shared secret an outside scheduler sends (Authorization: Bearer …) to run
  // timed jobs like the pending-booking nudge. Under 32 characters counts as
  // unset, which switches the endpoint off (404). Named as Vercel Cron names
  // it, so moving to Vercel's own cron later needs no change.
  cronSecret:
    (process.env.CRON_SECRET?.length ?? 0) >= 32 ? process.env.CRON_SECRET : undefined,
  adminUsername: process.env.ADMIN_USERNAME ?? 'admin',
  adminPassword:
    process.env.ADMIN_PASSWORD ??
    (process.env.NODE_ENV === 'production'
      ? requireEnv('ADMIN_PASSWORD')
      : 'admin'),
  adminTokenExpiresIn: process.env.ADMIN_TOKEN_EXPIRES_IN ?? '12h',
  isDev: (process.env.NODE_ENV ?? 'development') !== 'production',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  // Cloudflare R2 (S3-compatible) for vendor photos
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  r2Bucket: process.env.R2_BUCKET,
  // The private bucket for garage documents (owner ID, bank proof, the
  // signed agreement; modules/vendor-documents, docs/garage-documents.md).
  // Same account and keys as R2_BUCKET, but a bucket with no public access
  // at all: files are only read through five-minute presigned links made
  // for the garage's owner seat or a super-admin. Unset — as in development
  // and previews — and garage documents are off: their routes are 404, the
  // garage portal and admin hide the section, and no garage shows the
  // "Documents verified" badge.
  r2DocsBucket: process.env.R2_DOCS_BUCKET?.trim() || undefined,
  // Overrides the derived Cloudflare endpoint. Unset in every real
  // environment; the E2E stack points it at a local MinIO, which speaks the
  // same S3 API, so upload flows are exercised for real instead of asserting
  // a STORAGE_NOT_CONFIGURED 503.
  r2Endpoint: process.env.R2_ENDPOINT,
  // Public base URL the bucket is served from (e.g. https://cdn.detlio.com)
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, ''),
  r2MaxPhotosPerVendor: Number(process.env.R2_MAX_PHOTOS_PER_VENDOR ?? '10'),
  // Photos per service (and per package). Small by design: the details popup
  // shows them in a single row.
  r2MaxImagesPerService: Number(process.env.R2_MAX_IMAGES_PER_SERVICE ?? '3'),
  r2UploadUrlTtlSeconds: Number(process.env.R2_UPLOAD_URL_TTL_SECONDS ?? '120'),
  // ─── Service videos (Cloudflare Stream) ────────────────────────────────────
  // Garages and admin add a 60-second video per service; Stream stores it,
  // encodes it for adaptive playback up to Full HD and calls our webhook when
  // it is ready (lib/stream.ts, docs/service-media.md). Video is off — the
  // slot is hidden and its routes are 404 — unless all four are set. The
  // token needs Stream:Edit on the account and nothing else. Production (and
  // Preview, if previews should take videos) only; never in git.
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || undefined,
  cloudflareStreamApiToken: process.env.CLOUDFLARE_STREAM_API_TOKEN || undefined,
  // The `<code>` in https://customer-<code>.cloudflarestream.com, where
  // Stream serves posters and playback.
  cloudflareStreamCustomerCode: process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE || undefined,
  // The secret Stream returns when the webhook is registered; it signs every
  // webhook (Webhook-Signature) and nothing unsigned is believed.
  cloudflareStreamWebhookSecret: process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET || undefined,
  // E2E only: uploads land on this API's own fake endpoint and nothing ever
  // reaches Cloudflare. A spec fires the webhook itself, signed with the
  // secret above (apps/e2e/support/stream.ts).
  streamFake: readTestFake('STREAM_FAKE', 'sends video uploads to a fake endpoint instead of Cloudflare Stream'),
  // Where the fake endpoint is reached from the browser. E2E only.
  streamFakeBaseUrl: (process.env.STREAM_FAKE_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, ''),

  // ─── AI (OpenAI) ───────────────────────────────────────────────────────────
  // Every AI feature in Detlio goes through OpenAI with this one key: service
  // descriptions ("Write with AI", lib/ai.ts) and sample pictures for a
  // service with no real photo (lib/ai-images.ts), both admin only. Unset — as
  // in development, E2E and previews — and the features are off: the admin
  // panel hides their buttons (GET /admin/ai/config says { describe: false,
  // pictures: false }) and the picture routes are 404. The key lives in the
  // Vercel environment only, never in code or git.
  openaiApiKey: process.env.OPENAI_API_KEY || undefined,
  // Which model writes the text. An env value so it can be changed without a
  // release.
  aiTextModel: process.env.AI_TEXT_MODEL?.trim() || 'gpt-5.5',
  // Which model reads photos and PDFs for the garage import. Must take image
  // and PDF input and structured output. Same reason for an env value.
  aiVisionModel: process.env.AI_VISION_MODEL?.trim() || 'gpt-5.5',
  // "Write with AI" calls per admin per hour. Each one is a paid request, and
  // the editor's "Fill all empty descriptions" makes one per service.
  aiDescribeRateLimit: Number(process.env.AI_DESCRIBE_RATE_LIMIT ?? '60'),
  // Garage imports per admin per hour (photos, PDFs and Tally files alike).
  // A photo read is the dearest AI request Detlio makes; onboarding a
  // handful of garages an hour is far below this.
  aiImportRateLimit: Number(process.env.AI_IMPORT_RATE_LIMIT ?? '30'),
  // OpenAI's alias for the ChatGPT image model. Lokesh can pin a dated model
  // here without a deploy of new code.
  aiImageModel: process.env.AI_IMAGE_MODEL || 'chatgpt-image-latest',
  // Pictures cost money per call (about ₹4 each, two per press), so each
  // admin gets this many presses an hour.
  aiPicturesPerHour: Number(process.env.AI_PICTURES_PER_HOUR ?? '20'),
  // E2E only: "Write with AI" answers with a fixed sentence (FAKE_AI_TEXT),
  // every picture is the same small PNG, and OpenAI is never called.
  aiFake: readTestFake('AI_FAKE', 'replaces OpenAI with a fixed test sentence and picture'),

  // ─── Geocoding ─────────────────────────────────────────────────────────────
  // Which adapter in lib/geo backs address search. Ola Maps has the best data
  // for Indian addresses; the adapter exists so this is a config change rather
  // than a rewrite when that stops being true.
  geoProvider: (process.env.GEO_PROVIDER ?? 'ola') as GeoProviderName,
  olaMapsApiKey: process.env.OLA_MAPS_API_KEY,
  /**
   * Domain this key is registered against in the Ola console.
   *
   * Ola authorises API keys against a domain allowlist and reads the ORIGIN
   * header to decide — Referer is ignored. Server-side calls send no Origin, so
   * a restricted key rejects every request with 403
   * `{"message":"Domain  is not allowed."}`.
   *
   * Leave unset if the key has no domain restriction, which is the better setup
   * for a server-side key: the allowlist is a browser protection, this key never
   * reaches a browser, and an Origin header is trivially forged by any caller.
   */
  olaMapsOrigin: process.env.OLA_MAPS_ORIGIN,
  // Provider responses are cached in Postgres (geo_cache) to stay inside the
  // free tier. Addresses do not move, so this can be generous — the ceiling is
  // how long a genuinely new building should take to appear, not correctness.
  geoCacheTtlHours: Number(process.env.GEO_CACHE_TTL_HOURS ?? '720'),
  // Autocomplete is the only endpoint whose call volume tracks typing rather
  // than saves, so it gets its own tighter per-user limit on top of the global
  // rate limiter.
  geoAutocompleteRateLimit: Number(
    process.env.GEO_AUTOCOMPLETE_RATE_LIMIT ?? '60'
  ),
  /**
   * Whether an admin may verify a garage that has no pin.
   *
   * The end state is `true`: a garage with no coordinates cannot be found by a
   * customer browsing nearby, cannot be distance-sorted, and cannot have its
   * doorstep coverage checked, so letting it go live is letting it fail quietly.
   *
   * It defaults to `false` because that is not where the data is yet. Most
   * garages predate the map picker and were nulled by 0019, and a hard gate
   * would mean nothing new can be verified until every one of them is
   * revisited. Flip it on once the backlog is pinned — the admin list already
   * shows which garages those are.
   */
  geoRequirePin: process.env.GEO_REQUIRE_PIN === 'true',

  /**
   * Whether offers on Home may be shown to a chosen audience (customers who
   * booked a garage, live near it, have a wash due, own a car type, or have
   * never booked) rather than to everyone.
   *
   * Off unless set to `on`. Choosing who sees an offer from booking history or
   * location is a new use of personal data, and the privacy policy says
   * location is only for finding garages and nothing is used for marketing.
   * So while this is off, only 'everyone' offers reach Home, booking history
   * and location are never read for offers, and the admin API refuses to save
   * any other audience (409 TARGETING_DISABLED). Turn it on in the same
   * release that updates the privacy policy. The E2E stack runs with it on.
   *
   * It only decides who sees an offer on Home. Anyone may still type the
   * code at checkout.
   */
  homeOfferTargeting: ['on', 'true', '1'].includes(
    (process.env.HOME_OFFER_TARGETING ?? '').trim().toLowerCase()
  ),

  /**
   * Whether the admin "Start pilot clean" tool exists: ADMIN_DATA_RESET=on.
   *
   * Off unless set to `on`, and while off every /admin/data-reset route is a
   * 404 and the admin nav hides the page. It deletes test bookings, refunds
   * and checkouts for good, so it is switched on in Production only for the
   * reset itself (after a backup) and removed again straight after; see
   * docs/test-data-reset.md. The "Test" mark on a booking works either way.
   */
  adminDataReset: isDataResetEnabled(process.env.ADMIN_DATA_RESET),

  /**
   * Whether refunds go back through Razorpay with nobody pressing anything:
   * AUTO_REFUNDS=on. Off unless set to exactly `on`, and while off the only
   * change from manual refunds is the admin Refund now button.
   *
   * When on, the clear-cut cases (garage declined or no-show, the customer
   * cancelled in time, Detlio cancelled, a checkout paid with no booking)
   * are refunded right after the cancel commits, and the pending-digest cron
   * retries anything missed or failed. Final-bill money, part refunds and
   * bookings with an open complaint always wait for a person. See
   * lib/refund-sending.ts. Refunds come out of the Razorpay balance, which
   * must cover them.
   */
  autoRefunds: (process.env.AUTO_REFUNDS ?? '').trim().toLowerCase() === 'on',
  // The most the automatic mode refunds in an IST day, in rupees. Once a
  // refund would take it past this, automatic refunds stop until the next
  // day and the team gets one Telegram alert; the button still works.
  autoRefundDailyCapInr: parseDailyCap(process.env.AUTO_REFUND_DAILY_CAP_INR),

  // ─── Gift a wash (lib/gift-credit.ts, 0049) ─────────────────────────────────
  /**
   * Whether customers can buy Detlio gifts, redeem them as Detlio credit and
   * pay for bookings with that credit: GIFTS_ENABLED=on. Off unless set to
   * exactly `on`, and while off every gift and credit route but the two
   * `/config` ones is a 404 before auth runs, the apps hide every entry
   * point, and checkout never reads or spends credit.
   *
   * Off by default for a legal reason, not a technical one: a prepaid
   * instrument redeemable at many merchants may be a semi-closed PPI that
   * needs RBI authorisation, and Detlio sells garages' services as a
   * marketplace. The owner's lawyer/CA must confirm the structure first
   * (apps/users/lib/legal/gifts.ts, not public copy). Credit already on
   * accounts stays on them while off, and bookings already paid with it
   * still get it back when they are cancelled (the cron does that either
   * way).
   */
  giftsEnabled: (process.env.GIFTS_ENABLED ?? '').trim().toLowerCase() === 'on',

  // ─── Detlio Guarantee (lib/guarantee.ts, 0051) ──────────────────────────────
  /**
   * Whether customers can ask for a free redo within 48 hours of a job:
   * GUARANTEE_ENABLED=on. Off unless set to exactly `on`. While off every
   * guarantee route but the two `/config` ones is a 404 before auth runs,
   * the apps hide every entry point (the button, the checkout badge, the
   * portal's and admin's pages), and the cron's sweep reads nothing. Claims
   * already open stay as they are until it is on again; a refund Detlio
   * already approved stays owed (lib/refunds.ts reads the booking, not the
   * switch).
   */
  guaranteeEnabled: (process.env.GUARANTEE_ENABLED ?? '').trim().toLowerCase() === 'on',

  // ─── Detlio Rewards (lib/rewards.ts, 0050) ─────────────────────────────────
  /**
   * The master switch for the loyalty programme (Shine Card stamps, scratch
   * cards, streaks, levels, Invite a friend): REWARDS_ENABLED=on. Off unless
   * set. The admin's own switch (Rewards → Settings) works only while this
   * is on. While either is off every rewards route but the /config ones is
   * a 404 before auth, the apps hide every entry point, completed bookings
   * earn nothing, the cron sends no nudge, and a reward voucher is refused
   * at checkout. Every number (the monthly budget included) is a setting
   * the team edits in admin, stored in reward_settings.
   */
  rewardsEnabled: (process.env.REWARDS_ENABLED ?? '').trim().toLowerCase() === 'on',

  // ─── Garage response deadline (lib/response-deadline.ts, 0042) ─────────────
  /**
   * How many opening-hours minutes a garage has to accept (or reject, or
   * suggest other times for) a paid booking: GARAGE_RESPONSE_MINUTES, a whole
   * number from 5 to 240, default 30. Never later than an hour before the
   * slot, with a 15-minute floor from payment; see lib/response-deadline.ts.
   */
  garageResponseMinutes: parseResponseMinutes(process.env.GARAGE_RESPONSE_MINUTES),
  /**
   * Whether a paid booking nobody accepted in time is cancelled and refunded:
   * AUTO_CANCEL_UNANSWERED=on. Off unless set to exactly `on`, so the team can
   * tell garages first. While off the deadline is still worked out, stored
   * and shown to the garage and the customer as guidance, Accept and Suggest
   * times are never refused for it (no 409 RESPONSE_TIME_PASSED), and the
   * pending-digest cron cancels nothing.
   */
  autoCancelUnanswered: isAutoCancelOn(process.env.AUTO_CANCEL_UNANSWERED),

  // ─── Job photo standards (lib/job-photo-standards.ts, 0045) ────────────────
  /**
   * Whether garages must add 2 before photos to start a job and 2 after
   * photos to finish it: JOB_PHOTOS_REQUIRED, **off unless set to `on`**
   * (pilot: garages are nudged, not blocked; JOB_PHOTOS_REQUIRED_GARAGES turns
   * it on garage by garage). Admin can still waive it on one booking.
   */
  jobPhotosRequired: parsePhotosRequired(process.env.JOB_PHOTOS_REQUIRED),
  /**
   * Garage ids (comma separated) that have the standard while
   * JOB_PHOTOS_REQUIRED is off: the garage-by-garage roll-out, and how the E2E
   * suite turns it on for its own garage only. Ignored while it is on.
   */
  jobPhotosRequiredGarages: parseRequiredGarages(process.env.JOB_PHOTOS_REQUIRED_GARAGES),

  // ─── Rate limiting ─────────────────────────────────────────────────────────
  // Both limiters key on client IP. The defaults are the production values;
  // they are configurable because a test suite runs every request from a single
  // IP and would otherwise spend most of a run being throttled by itself.
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT ?? '10'),
  globalRateLimit: Number(process.env.GLOBAL_RATE_LIMIT ?? '100'),
  // Usage-event batches (POST /events) per IP per minute. Counted on their
  // own and never against the global limit above, so analytics can never
  // use up a customer's allowance for checkout. The app sends a batch every
  // few seconds at most, and only while something happened.
  analyticsRateLimit: Number(process.env.ANALYTICS_RATE_LIMIT ?? '60'),
  // Gift code lookups and redemptions (POST /gifts/lookup, /users/me/gifts/
  // redeem) per IP per minute. Wrong codes are also counted in the database
  // (lib/gift-credit.ts), which is the real cap on guessing.
  giftCodeRateLimit: Number(process.env.GIFT_CODE_RATE_LIMIT ?? '20'),
  // Service History certificate lookups (POST /certificates/verify, 0053) per
  // IP per minute. Tokens are 192 bits, so this caps load rather than
  // guessing. The customer app's /verify page calls it from its server, so
  // that page also limits each viewer itself (apps/users/lib/certificates.ts).
  certificateLookupRateLimit: Number(process.env.CERTIFICATE_LOOKUP_RATE_LIMIT ?? '60'),

  // ─── Usage events (lib/analytics.ts) ───────────────────────────────────────
  // E2E only: let Playwright's headless browser record events, which are
  // otherwise dropped with crawlers. Refused in production.
  analyticsAllowHeadless: readTestFake(
    'ANALYTICS_ALLOW_HEADLESS',
    'records usage events from headless browsers'
  ),
} as const

/** Whether browser notifications are on (VAPID set, or the E2E stand-in). */
export function isPushEnabled(): boolean {
  return isPushConfigured({
    publicKey: env.vapidPublicKey,
    privateKey: env.vapidPrivateKey,
    subject: env.vapidSubject,
    fake: env.pushFake,
  })
}
