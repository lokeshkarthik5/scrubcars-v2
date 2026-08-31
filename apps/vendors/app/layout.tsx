import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
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

export const metadata: Metadata = {
  title: 'Detlio for Partners',
  description: 'Manage your garage on Detlio',
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
