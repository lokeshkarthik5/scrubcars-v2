import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Sans_Tamil, Space_Grotesk } from 'next/font/google'
import { ToastContainer } from 'react-toastify'
import { QueryProvider } from '@repo/ui/providers/query-provider'
import { IosZoomGuard } from '@repo/ui/sc/ios-zoom-guard'
import { AppProvider } from '@/components/providers/app-provider'
import { VendorScope } from '@/components/vendor-scope'
import { BookNavProvider } from '@/components/book/book-nav-provider'
import 'react-toastify/dist/ReactToastify.css'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

// The brand's face for figures — prices, times, counts, booking references —
// behind `font-numeric`, loaded exactly as the customer app loads it. The
// portal used that class everywhere but never loaded the face, so a garage
// read its jobs' times in Inter while its customers read them in Space
// Grotesk. Only the two weights the brand allows; latin-ext carries the
// rupee sign.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '700'],
  variable: '--font-space-grotesk',
})

// Tamil, when it is chosen under Settings → Account or Your account, loaded
// as the customer website loads it: the stack goes on to it for Tamil letters
// alone, and an English page never fetches it.
const notoSansTamil = Noto_Sans_Tamil({
  subsets: ['tamil'],
  variable: '--font-noto-tamil',
  preload: false,
})

export const metadata: Metadata = {
  title: 'Detlio for Partners',
  description: 'Manage your garage on Detlio',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // No maximumScale: capping it at 1 stopped Android users zooming at all.
  // iOS keeps the cap through IosZoomGuard, which stops Safari zooming into
  // a focused field and nothing else (iOS ignores it for pinch-zoom).
  // The browser's own chrome in the canvas colour, as in the customer app, so
  // the portal does not sit under a grey address bar on Android.
  themeColor: '#0A0A0B',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // English until the client reads the choice (AppProvider, useDocumentLang).
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${notoSansTamil.variable} h-full`}
    >
      <body className="min-h-full font-sans">
        <IosZoomGuard />
        {/* Outside AppProvider: the auth gate returns null while it resolves,
            and queries mounted underneath must keep their cache across that. */}
        <QueryProvider>
          <AppProvider>
            <VendorScope>
              {/* Garage Book's bar on every page while the book is on (0072). */}
              <BookNavProvider>{children}</BookNavProvider>
            </VendorScope>
          </AppProvider>
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
