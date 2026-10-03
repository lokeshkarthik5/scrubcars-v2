/**
 * Whether this browser last resolved to a signed-in customer with a finished
 * profile, kept in localStorage so the homepage can send them on to /home
 * before it paints.
 *
 * The session lives in HttpOnly cookies on the API host, which this origin
 * cannot read, so the only other way to know a visitor is signed in is a round
 * trip to the API — by which time the homepage has already painted and the
 * redirect reads as a flash. AppProvider sets the hint whenever a session
 * resolves to a customer with a finished profile and clears it otherwise.
 *
 * A hint, not a credential, which is why it only ever points at /home: that
 * route is public, so a stale hint (a session that ended on another surface,
 * an expired refresh token) costs a signed-out visitor one detour, and the
 * session resolving there clears it. Unfinished profiles are deliberately left
 * out — /profile-setup is guarded, so a stale hint there would strand a
 * signed-out visitor on the login screen. AppProvider routes them instead,
 * once the session resolves.
 */
export const SIGNED_IN_HINT_KEY = 'detlio:signed-in'

/**
 * Rendered in the root layout's <head>, so it runs while the document is
 * still parsing — before the homepage paints — and is never re-created by
 * client navigation (React does not execute scripts it inserts itself; on a
 * client-side visit to '/', AppProvider handles the redirect).
 */
export const SIGNED_IN_REDIRECT_SCRIPT = `if(location.pathname==='/'){try{if(localStorage.getItem(${JSON.stringify(
  SIGNED_IN_HINT_KEY
)})==='1')location.replace('/home')}catch(e){}}`
