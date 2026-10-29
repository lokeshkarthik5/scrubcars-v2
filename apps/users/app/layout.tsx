import { Suspense } from 'react'
import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { ToastContainer } from 'react-toastify'
import { Analytics } from '@/components/analytics'
import { Clarity } from '@/components/clarity'
import { ConsentBanner } from '@/components/consent/consent-banner'
import { MetaPixel } from '@/components/meta-pixel'
import { AppProvider } from '@/components/providers/app-provider'
import { SIGNED_IN_REDIRECT_SCRIPT } from '@/components/providers/signed-in-landing'
import { QueryProvider } from '@repo/ui/providers/query-provider'
import { IosZoomGuard } from '@repo/ui/sc/ios-zoom-guard'
import 'react-toastify/dist/ReactToastify.css'
import './globals.css'

// With its optical-size axis: the browser then draws large text (Home's 22pt
// offer titles, the 34pt car name) with the display cut's tighter spacing,
// so titles wrap where the approved mockups wrap them. Small text is
// unchanged.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  axes: ['opsz'],
})

// The brand's face for figures — prices, durations, dates and times — exposed
// as `font-numeric` (see globals.css). Only the two weights the brand allows:
// a `font-semibold` figure resolves to the 700 rather than a synthesised 600.
// latin-ext carries the rupee sign, which latin alone does not.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '700'],
  variable: '--font-space-grotesk',
})

const TITLE = 'Detlio'
const DESCRIPTION = 'Book car wash & detailing'

/**
 * Every page's defaults; a page can say more (the homepage does).
 *
 * The icons, the manifest and the share image are files beside this one
 * (favicon.ico, icon.png, apple-icon.png, manifest.ts, opengraph-image.png,
 * twitter-image.png), which Next links from every page by itself.
 * `metadataBase` is what turns the share image's path into the absolute URL
 * WhatsApp and the rest need: the production customer site, as the homepage
 * already names it for its canonical link. Preview builds share links that
 * point at production's image, which is the same picture.
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://detlio.com'),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'Detlio',
  openGraph: {
    type: 'website',
    siteName: 'Detlio',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // No maximumScale: capping it at 1 stopped Android users zooming at all.
  // iOS keeps the cap through IosZoomGuard, which stops Safari zooming into
  // a focused field and nothing else (iOS ignores it for pinch-zoom).
  // The browser's own chrome (Android's address bar) in the app's canvas
  // colour, so the page does not sit under a grey bar. Deliberately no
  // `colorScheme: 'dark'` beside it: a dark page with a light-scheme iframe
  // gets that iframe painted opaque, and Razorpay's checkout is an iframe
  // whose backdrop is meant to be see-through.
  themeColor: '#0A0A0B',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} h-full`}
    >
      <head>
        {/* Sends a returning customer from the homepage to /home before it
            paints. Here rather than in the page so it runs ahead of the body
            and is never re-created on client navigation. */}
        <script
          dangerouslySetInnerHTML={{ __html: SIGNED_IN_REDIRECT_SCRIPT }}
        />
      </head>
      <body className="min-h-full font-sans">
        <IosZoomGuard />
        {/* Suspense for their useSearchParams (all stay off pages whose
            address holds a code or a booking's id). The cookie question
            comes first in the page, in the flow, so it never covers a
            page's own buttons; the Pixel and Clarity load only once it is
            answered "Allow". */}
        <Suspense fallback={null}>
          <ConsentBanner />
          <MetaPixel />
          <Clarity />
        </Suspense>
        {/* Detlio's own usage events, for the admin's Funnel and Behaviour;
            mirrored to the Pixel and Clarity only with consent
            (lib/meta-pixel.ts, lib/clarity.ts). */}
        <Analytics />
        {/* Outside AppProvider: the auth gate returns null while it resolves,
            and queries mounted underneath must keep their cache across that. */}
        <QueryProvider>
          <AppProvider>{children}</AppProvider>
        </QueryProvider>
        <ToastContainer
          position="top-center"
          autoClose={3000}
          hideProgressBar
          closeOnClick
          pauseOnHover={false}
          theme="dark"
          toastStyle={{ fontSize: '13px', borderRadius: '10px' }}
        />
      </body>
    </html>
  )
}
