'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { IconCheck, IconChevronDown } from '@tabler/icons-react'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { cn } from '@repo/core/utils'

const ROLE_LABEL: Record<string, string> = {
  vendor_admin: 'Admin',
  vendor_operator: 'Operator',
}

/**
 * In-page company switcher for people who belong to more than one garage.
 *
 * Renders nothing at all for the single-company case, which is almost everyone
 * — a switcher with one option is a control that only ever tells you what you
 * already knew.
 */
export function CompanySwitcher({ className }: { className?: string }) {
  const vendors = useAuthStore((s) => s.vendors)
  const activeVendorId = useAuthStore((s) => s.activeVendorId)
  const setActiveVendor = useAuthStore((s) => s.setActiveVendor)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  if (vendors.length < 2) return null

  const active = vendors.find((v) => v.id === activeVendorId) ?? vendors[0]

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 max-w-[190px] items-center gap-1.5 rounded-[10px] border border-border bg-surface px-2.5"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <CompanyLogo url={active.logoUrl} name={active.businessName} />
        <span className="truncate text-[12px] font-medium text-text-primary">
          {active.businessName}
        </span>
        <IconChevronDown size={14} stroke={1.5} className="shrink-0 text-text-muted" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-1 w-[248px] overflow-hidden rounded-[10px] border border-border bg-surface shadow-lg"
        >
          {vendors.map((vendor) => {
            const isActive = vendor.id === active.id
            return (
              <button
                key={vendor.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  setActiveVendor(vendor.id)
                  setOpen(false)
                }}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-elevated"
              >
                <CompanyLogo url={vendor.logoUrl} name={vendor.businessName} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-text-primary">
                    {vendor.businessName}
                  </span>
                  <span className="block text-[11px] text-text-secondary">
                    {vendor.isOwner
                      ? 'Owner'
                      : ROLE_LABEL[vendor.role ?? ''] ?? 'Member'}
                  </span>
                </span>
                {isActive && (
                  // White, as the chosen option is everywhere else: red is for
                  // what to press.
                  <IconCheck size={16} stroke={2} className="shrink-0 text-text-primary" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CompanyLogo({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={20}
        height={20}
        className="size-5 shrink-0 rounded object-cover"
      />
    )
  }

  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded bg-surface-elevated text-[10px] font-semibold text-text-primary">
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
