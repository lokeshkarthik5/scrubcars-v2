import type { MetadataRoute } from 'next'

/**
 * The garage portal's web app manifest, served at /manifest.webmanifest and
 * linked from every page by Next. It is what lets a garage put the portal on
 * its phone's Home Screen: Android Chrome offers "Install app", and an
 * iPhone needs it before it will show notifications at all (iOS 16.4+ gives
 * web push only to a Home Screen app, 0044).
 *
 * Opens on /home, the jobs waiting to be accepted. The colours are the
 * portal's canvas, #0A0A0B, as the root layout's `themeColor`; the icons
 * are the customer app's "D." monogram (apps/users/app/manifest.ts).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Detlio for Partners',
    short_name: 'Detlio Partner',
    description: 'Manage your garage on Detlio',
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
