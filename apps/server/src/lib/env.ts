import 'dotenv/config'
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

  // ─── Rate limiting ─────────────────────────────────────────────────────────
  // Both limiters key on client IP. The defaults are the production values;
  // they are configurable because a test suite runs every request from a single
  // IP and would otherwise spend most of a run being throttled by itself.
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT ?? '10'),
  globalRateLimit: Number(process.env.GLOBAL_RATE_LIMIT ?? '100'),
} as const
