import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { ToastContainer } from 'react-toastify'
import { AppProvider } from '@/components/providers/app-provider'
import { SIGNED_IN_REDIRECT_SCRIPT } from '@/components/providers/signed-in-landing'
import { QueryProvider } from '@repo/ui/providers/query-provider'
import 'react-toastify/dist/ReactToastify.css'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
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

export const metadata: Metadata = {
  title: 'Detlio',
  description: 'Book car wash & detailing',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
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
