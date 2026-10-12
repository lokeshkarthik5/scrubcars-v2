export class AppError extends Error {
  /**
   * Seconds until the same request can succeed, for a refusal that is only
   * about timing (a rate limit). Sent as a Retry-After header and as
   * `retryAfterSeconds` in the error body, so a client can count down to the
   * moment rather than guess at it.
   */
  public readonly retryAfterSeconds?: number

  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    options?: { retryAfterSeconds?: number }
  ) {
    super(message)
    this.name = 'AppError'
    this.retryAfterSeconds = options?.retryAfterSeconds
  }
}

/**
 * Whether a database error carries this Postgres SQLSTATE ('23514' is a
 * failed CHECK). Drizzle wraps the driver's error and keeps it as `cause`,
 * so both are looked at.
 */
export function hasPgCode(err: unknown, code: string): boolean {
  const read = (value: unknown) =>
    typeof value === 'object' && value !== null && 'code' in value
      ? (value as { code?: unknown }).code
      : undefined
  if (read(err) === code) return true
  const cause = typeof err === 'object' && err !== null && 'cause' in err ? (err as { cause?: unknown }).cause : undefined
  return read(cause) === code
}
