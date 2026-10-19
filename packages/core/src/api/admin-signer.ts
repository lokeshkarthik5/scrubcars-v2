/**
 * Who signs the panel's admin writes, for an API from before personal logins
 * (0058). The admin panel deploys straight from Git when a change merges,
 * but the API only after E2E passes on main (release-api.yml), so for a
 * while the new panel talks to the old API, which refuses a write with no
 * typed name. Each signed write still carries the signed-in admin's name;
 * the new API ignores it and signs with the session. Remove this file and
 * its calls once 0058's API is live.
 */
let signer = 'admin'

/** Set by the admin panel from GET /admin/me; 'admin' until then, or when the old API says no name. */
export function setAdminSigner(name: string | null | undefined) {
  signer = name?.trim() || 'admin'
}

/** JSON.stringify for a signed admin write: the body plus the signer's name. */
export function signedBody(body: object, field: 'actorName' | 'loggedBy' = 'actorName'): string {
  return JSON.stringify({ ...body, [field]: signer })
}
