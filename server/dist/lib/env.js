import "dotenv/config";
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
export const env = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    databaseUrl: requireEnv("DATABASE_URL"),
    jwtSecret: process.env.JWT_SECRET ??
        (process.env.NODE_ENV === "production"
            ? requireEnv("JWT_SECRET")
            : "dev-jwt-secret-change-me"),
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
    refreshTokenExpiresDays: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? "30"),
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    smsApiKey: process.env.SMS,
    gcsBucket: process.env.GCS_BUCKET,
    gcsProjectId: process.env.GCS_PROJECT_ID,
    gcsClientEmail: process.env.GCS_CLIENT_EMAIL,
    gcsPrivateKey: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    gcsConfigured: Boolean(process.env.GCS_BUCKET &&
        process.env.GCS_PROJECT_ID &&
        process.env.GCS_CLIENT_EMAIL &&
        process.env.GCS_PRIVATE_KEY),
    isDev: (process.env.NODE_ENV ?? "development") !== "production",
};
