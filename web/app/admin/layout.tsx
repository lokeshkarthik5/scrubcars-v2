'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { IconDroplet, IconLogout } from '@tabler/icons-react'
import { adminLogout } from '@/lib/api/admin'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/admin/vendors', label: 'Vendors' },
  { href: '/admin/bookings', label: 'Bookings' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  // Login page renders standalone, without the chrome.
  if (pathname.endsWith('/login') || pathname.endsWith('/admin')) {
    return <>{children}</>
  }

  const handleLogout = async () => {
    try {
      await adminLogout()
    } finally {
      router.replace('/admin/login')
    }
  }

  return (
    <div className="min-h-dvh bg-brand-black text-text-primary">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-brand-black/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <IconDroplet size={22} className="text-brand-red" />
            <span className="text-[15px] font-semibold">Detlio Admin</span>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname.includes(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors',
                    active
                      ? 'bg-surface text-text-primary'
                      : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-brand-red"
        >
          <IconLogout size={16} /> Logout
        </button>
      </header>
      <main className="mx-auto w-full max-w-[1100px] px-6 py-6">{children}</main>
    </div>
  )
}
