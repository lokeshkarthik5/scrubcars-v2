'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  IconBrandWhatsapp,
  IconDroplet,
  IconLogout,
  IconPhone,
} from '@tabler/icons-react'
import { adminLogout } from '@/lib/api/admin'
import {
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_TEL_HREF,
  SUPPORT_WHATSAPP_HREF,
} from '@/lib/support'
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
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <a
              href={SUPPORT_TEL_HREF}
              title={`Call support · ${SUPPORT_PHONE_DISPLAY}`}
              className="flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-text-primary"
            >
              <IconPhone size={16} />
              <span className="hidden sm:inline">Support</span>
            </a>
            <a
              href={SUPPORT_WHATSAPP_HREF}
              target="_blank"
              rel="noopener noreferrer"
              title={`WhatsApp support · ${SUPPORT_PHONE_DISPLAY}`}
              className="text-text-secondary hover:text-[#25D366]"
            >
              <IconBrandWhatsapp size={18} />
            </a>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-brand-red"
          >
            <IconLogout size={16} /> Logout
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1100px] px-6 py-6">{children}</main>
    </div>
  )
}
