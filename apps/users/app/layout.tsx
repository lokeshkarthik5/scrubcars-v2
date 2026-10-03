import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
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

export const metadata: Metadata = {
  title: 'Detlio',
  description: 'Book car wash & detailing',
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
