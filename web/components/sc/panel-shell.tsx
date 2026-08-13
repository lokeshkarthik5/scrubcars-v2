'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconBrandWhatsapp,
  IconDroplet,
  IconLogout,
  IconPhone,
} from '@tabler/icons-react'
import {
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_TEL_HREF,
  SUPPORT_WHATSAPP_HREF,
} from '@/lib/support'
import { cn } from '@/lib/utils'
import { BottomNav, type NavType } from './bottom-nav'

export interface PanelNavItem {
  href: string
  label: string
}

interface PanelShellProps {
  /** Shown next to the brand mark, e.g. "Admin". */
  brandLabel: string
  navItems: PanelNavItem[]
  /** Which BottomNav tab set to render on mobile. */
  navType: NavType
  onLogout?: () => void
  children: React.ReactNode
  className?: string
}

/**
 * Shell for the operator panels. Same design language as AppShell — the
 * 428px column and BottomNav on phones — but at `md` it widens to a 1100px
 * workspace with the tabs promoted into the header, so bulk work (long vendor
 * and booking lists) isn't squeezed into a phone column on a desktop.
 */
export function PanelShell({
  brandLabel,
  navItems,
  navType,
  onLogout,
  children,
  className,
}: PanelShellProps) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname.startsWith(href)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[428px] flex-col bg-brand-black text-text-primary md:max-w-none">
      <header className="sticky top-0 z-30 border-b border-border bg-brand-black/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-6">
            <div className="flex shrink-0 items-center gap-2">
              <IconDroplet size={22} className="text-brand-red" />
              <span className="text-[15px] font-semibold">Detlio {brandLabel}</span>
            </div>
            {/* Tabs live in the header on desktop and in the BottomNav on mobile. */}
            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-surface text-text-primary'
                      : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-4">
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
            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-brand-red"
                aria-label="Logout"
              >
                <IconLogout size={16} />
                <span className="hidden sm:inline">Logout</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main
        className={cn(
          'mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-4 py-4 md:px-6 md:py-6',
          // Clear the mobile BottomNav; on md the nav is gone, so drop it.
          'pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6',
          className
        )}
      >
        {children}
      </main>

      <div className="md:hidden">
        <BottomNav type={navType} />
      </div>
    </div>
  )
}
