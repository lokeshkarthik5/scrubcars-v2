'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AppShell } from '@/components/sc/app-shell'
import { ScBadge } from '@/components/sc/badge'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { ScInput } from '@/components/sc/input'
import { TopBar } from '@/components/sc/top-bar'
import { MOCK_SERVICES } from '@/lib/mock/data'
import { getCurrentUser } from '@/lib/api/users'
import type { Service, User } from '@/lib/types'
import { cn } from '@/lib/utils'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function VendorSettingsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [services, setServices] = useState<Service[]>(MOCK_SERVICES)
  const [areas, setAreas] = useState(['600020 — Adyar'])
  const [pincode, setPincode] = useState('')
  const [closedDays, setClosedDays] = useState<Record<string, boolean>>({})

  useEffect(() => {
    getCurrentUser().then(setUser)
  }, [])

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <TopBar title="Settings" />

      <section>
        <h2 className="mb-2 text-sm font-semibold">Profile</h2>
        <ScCard>
          <p className="text-[13px] font-semibold">{user?.name ?? 'Sparkle Auto Care'}</p>
          <p className="text-[11px] text-text-secondary">+91 {user?.phone}</p>
        </ScCard>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Working hours</h2>
        <div className="flex flex-col gap-2">
          {DAYS.map((day) => (
            <ScCard
              key={day}
              className={cn('flex items-center gap-2', closedDays[day] && 'opacity-50')}
            >
              <span className="w-8 text-[12px] font-medium">{day}</span>
              <input type="time" defaultValue="09:00" className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-[12px]" disabled={closedDays[day]} />
              <input type="time" defaultValue="18:00" className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-[12px]" disabled={closedDays[day]} />
              <button
                type="button"
                onClick={() => setClosedDays({ ...closedDays, [day]: !closedDays[day] })}
                className={cn('text-[10px] font-medium', closedDays[day] ? 'text-brand-red' : 'text-text-secondary')}
              >
                {closedDays[day] ? 'Closed' : 'Open'}
              </button>
            </ScCard>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Service areas</h2>
        <div className="flex gap-2">
          <ScInput placeholder="Pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} className="flex-1" />
          <ScButton fullWidth={false} className="px-4" onClick={() => { if (pincode) { setAreas([...areas, `${pincode} — Area`]); setPincode('') } }}>
            Add
          </ScButton>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {areas.map((a) => (
            <span key={a} className="rounded-md border border-border bg-surface px-2 py-1 text-[11px]">{a} ×</span>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Services</h2>
          <Link href="/vendor/onboarding/step-4" className="text-[12px] text-brand-red">+ Add service</Link>
        </div>
        <div className="flex flex-col gap-2">
          {services.map((svc) => (
            <ScCard key={svc.id} className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium">{svc.name}</p>
                <p className="text-[11px] text-text-secondary">₹{svc.price} · {svc.durationMins} min</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="text-[11px] text-brand-red">Edit</button>
                <ScBadge variant={svc.isActive ? 'success' : 'muted'}>
                  {svc.isActive ? 'Active' : 'Inactive'}
                </ScBadge>
              </div>
            </ScCard>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Job types</h2>
        <ScCard className="flex items-center justify-between">
          <span className="text-[13px]">Doorstep jobs</span>
          <div className="h-6 w-11 rounded-full bg-brand-red"><div className="h-5 w-5 translate-x-5 rounded-full bg-white" /></div>
        </ScCard>
        <ScCard className="mt-2 flex items-center justify-between">
          <span className="text-[13px]">Drop-in jobs</span>
          <div className="h-6 w-11 rounded-full bg-brand-red"><div className="h-5 w-5 translate-x-5 rounded-full bg-white" /></div>
        </ScCard>
      </section>

      <Link href="/vendor/reviews">
        <ScCard className="text-[13px] text-brand-red">View reviews →</ScCard>
      </Link>
    </AppShell>
  )
}
