import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { ToastContainer } from 'react-toastify'
import { QueryProvider } from '@repo/ui/providers/query-provider'
import { IosZoomGuard } from '@repo/ui/sc/ios-zoom-guard'
import { AdminScope } from '@/components/admin-scope'
import 'react-toastify/dist/ReactToastify.css'
import './globals.css'

// With the optical-size axis: the shared offer coupon (Preview on Home) was
// tuned with it, and at the coupon's 22px title Inter's tighter display cut
// is what keeps a title on the lines the approved design gives it. Text at
// the panel's 11–15px stays on the text cut (the axis follows the size).
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  axes: ['opsz'],
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
  // No maximumScale: capping it at 1 stopped Android users zooming at all.
  // iOS keeps the cap through IosZoomGuard, which stops Safari zooming into
  // a focused field and nothing else (iOS ignores it for pinch-zoom).
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
        <IosZoomGuard />
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
