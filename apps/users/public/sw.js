/*
 * Detlio's service worker: browser notifications only (0044).
 *
 * It shows a notification when the API sends one (`push`) and opens the
 * page it is about when tapped (`notificationclick`). Nothing else: no
 * offline cache and no `fetch` handler, so every page loads from the
 * network exactly as it did before. Registered only when someone turns
 * notifications on (Profile → Notifications), never on a page load.
 *
 * A notification says only booking basics (the garage, the service, the
 * time), never anyone's phone, address or a pickup code: see
 * apps/server/src/lib/push-messages.ts. The garage portal has its twin at
 * apps/vendors/public/sw.js; keep the two alike.
 */

const ICON = '/icons/icon-192.png'

/** An app path on this site, never another site: anything else opens Home. */
function pagePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

self.addEventListener('install', () => {
  // A new version takes over at once; it holds no cache to migrate.
  self.skipWaiting()
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Detlio'
  const tag = typeof data.tag === 'string' && data.tag ? data.tag : undefined
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      icon: ICON,
      tag,
      // A newer update to the same booking replaces the last one, and still
      // buzzes.
      renotify: Boolean(tag),
      data: { url: pagePath(data.url) },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(pagePath(event.notification.data && event.notification.data.url), self.location.origin)
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const same = windows.find((client) => client.url === target.href)
      if (same) return same.focus()
      const open = windows.find((client) => new URL(client.url).origin === target.origin)
      if (open) {
        try {
          const moved = await open.navigate(target.href)
          if (moved) return moved.focus()
        } catch {
          // A tab this worker does not control cannot be moved: open one.
        }
      }
      return self.clients.openWindow(target.href)
    })()
  )
})
