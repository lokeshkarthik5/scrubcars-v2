import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ToastContainer } from 'react-toastify'
import { QueryProvider } from '@repo/ui/providers/query-provider'
import { AdminScope } from '@/components/admin-scope'
import 'react-toastify/dist/ReactToastify.css'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Detlio Admin',
  description: 'Detlio operations panel',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
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
