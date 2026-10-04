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
