/** Any origin works as long as it is ours alone; `.invalid` can never resolve. */
const BASE = 'https://detlio.invalid'

/**
 * The in-app path a `next` parameter may send someone to, or null.
 *
 * `next` rides in a URL anyone can craft (`/login?next=…`), and every consumer
 * hands it to `router.push`, which follows an absolute URL straight off-site.
 * So only a same-origin path survives: it has to start with `/`, and still be
 * on our origin once a browser has parsed it. The parse is the part that
 * matters — it is what turns `//evil.com`, `/\evil.com` and the tab or newline
 * variants of them into the other host they really are.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/')) return null

  try {
    const url = new URL(value, BASE)
    if (url.origin !== BASE) return null
    // Dot segments can resolve to a path that is itself protocol-relative:
    // "/..//evil.com" parses as our origin with the pathname "//evil.com".
    if (url.pathname.startsWith('//')) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}
