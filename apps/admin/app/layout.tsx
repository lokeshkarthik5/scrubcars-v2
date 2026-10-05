import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { ToastContainer } from 'react-toastify'
import { QueryProvider } from '@repo/ui/providers/query-provider'
import { AdminScope } from '@/components/admin-scope'
import 'react-toastify/dist/ReactToastify.css'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

// The brand's face for figures, behind `font-numeric`. The panel has always
// used that class for amounts and times but never loaded the face, so they
// fell back to Inter; the pilot numbers are mostly figures, so it is loaded
// now. Same two weights as the customer app.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '700'],
  variable: '--font-space-grotesk',
})

export const metadata: Metadata = {
  title: 'Detlio Admin',
  description: 'Detlio operations panel',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // The browser's own chrome in the canvas colour, as in the other two apps.
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
        {/* Admin has no AppProvider: it authenticates with username/password
            against /admin/me, not the customer/vendor OTP session, and guards
            imperatively inside AdminScope. */}
        <QueryProvider>
          <AdminScope>{children}</AdminScope>
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
