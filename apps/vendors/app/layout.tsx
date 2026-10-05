import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { ToastContainer } from 'react-toastify'
import { QueryProvider } from '@repo/ui/providers/query-provider'
import { AppProvider } from '@/components/providers/app-provider'
import { VendorScope } from '@/components/vendor-scope'
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

export const metadata: Metadata = {
  title: 'Detlio for garages',
  description: 'Manage your garage on Detlio',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
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
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} h-full`}>
      <body className="min-h-full font-sans">
        {/* Outside AppProvider: the auth gate returns null while it resolves,
            and queries mounted underneath must keep their cache across that. */}
        <QueryProvider>
          <AppProvider>
            <VendorScope>{children}</VendorScope>
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
