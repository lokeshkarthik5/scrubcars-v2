import 'dotenv/config'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret:
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === 'production'
      ? requireEnv('JWT_SECRET')
      : 'dev-jwt-secret-change-me'),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  refreshTokenExpiresDays: Number(
    process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '30'
  ),
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
    : [
        'http://localhost:3000',
        'https://www.detlio.com',
        'https://vendor.detlio.com',
        'https://admin.detlio.com',
      ],
  smsApiKey: process.env.SMS,
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
  // Public base URL the bucket is served from (e.g. https://cdn.detlio.com)
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, ''),
  r2MaxPhotosPerVendor: Number(process.env.R2_MAX_PHOTOS_PER_VENDOR ?? '10'),
  r2UploadUrlTtlSeconds: Number(process.env.R2_UPLOAD_URL_TTL_SECONDS ?? '120'),
} as const
