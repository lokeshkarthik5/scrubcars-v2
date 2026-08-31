'use client'

/**
 * Landing gate.
 *
 * Renders nothing: AppProvider treats '/' as a guest route and sends the
 * visitor on to /welcome or /home once the session resolves.
 *
 * This used to be a server component reading the `access_token` cookie, which
 * never worked — that cookie is set with Path=/api/v1, so it is not sent on a
 * request to '/', and every visitor took the signed-out branch. Now that the
 * frontends call api.detlio.com directly the cookie is not on this host at all,
 * so the decision has to happen client-side against the session.
 */
export default function RootPage() {
  return null
}
