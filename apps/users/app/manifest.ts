import type { MetadataRoute } from 'next'

/**
 * The web app manifest, served at /manifest.webmanifest and linked from every
 * page by Next. It is what "Add to Home screen" reads: the name under the
 * icon, the screen it opens on, and the colours it shows while loading.
 *
 * Opens on /home rather than /: the homepage is for visitors, and someone who
 * has added Detlio to their phone has come to book.
 *
 * The colours are the app's canvas, the same #0A0A0B the root layout gives the
 * browser's own chrome (`themeColor`), so the splash screen and the first
 * paint match.
 *
 * The icons are the "D." monogram (the wordmark's capital D and red period)
 * on graphite. The maskable one keeps the glyph inside the middle 80%, the
 * circle a launcher may crop any icon to; the others are opaque squares,
 * drawn as they are.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Detlio',
    short_name: 'Detlio',
    description: 'Book car wash & detailing',
    start_url: '/home',
    display: 'standalone',
    background_color: '#0A0A0B',
    theme_color: '#0A0A0B',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
