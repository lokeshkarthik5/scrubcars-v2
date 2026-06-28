import Link from 'next/link'
import { IconBuildingStore, IconDroplet, IconUser } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { ScCard } from '@/components/sc/card'

export default function HomePage() {
  return (
    <AppShell className="justify-center gap-8 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <IconDroplet size={48} className="text-brand-red" />
        <h1 className="text-[22px] font-semibold text-text-primary">Scrub Cars</h1>
        <p className="text-[13px] text-text-secondary">Car care at your doorstep</p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <Link href="/login">
          <ScCard className="flex items-center gap-4 transition-colors hover:border-brand-red/40">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-accent-muted">
              <IconUser size={22} className="text-brand-red" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[14px] font-semibold text-text-primary">Customer</p>
              <p className="text-[12px] text-text-secondary">Book washes &amp; detailing</p>
            </div>
          </ScCard>
        </Link>

        <Link href="/vendor/login">
          <ScCard className="flex items-center gap-4 transition-colors hover:border-brand-red/40">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-accent-muted">
              <IconBuildingStore size={22} className="text-brand-red" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[14px] font-semibold text-text-primary">Vendor</p>
              <p className="text-[12px] text-text-secondary">Manage your garage &amp; bookings</p>
            </div>
          </ScCard>
        </Link>
      </div>

      <p className="text-center text-[11px] text-text-muted">
        Choose how you&apos;d like to sign in
      </p>
    </AppShell>
  )
}
