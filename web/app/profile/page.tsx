'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconLogout } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { TopBar } from '@/components/sc/top-bar'
import { logout } from '@/lib/api/auth'
import { getCurrentUser } from '@/lib/api/users'
import type { User } from '@/lib/types'

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    getCurrentUser().then(setUser)
  }, [])

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  return (
    <AppShell showNav className="gap-4 py-4">
      <TopBar title="Profile" />

      <ScCard className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-muted text-lg font-semibold text-brand-red">
          {user?.name?.slice(0, 1) ?? '?'}
        </div>
        <div>
          <p className="text-[15px] font-semibold text-text-primary">{user?.name}</p>
          <p className="text-[12px] text-text-secondary">+91 {user?.phone}</p>
          {user?.area && (
            <p className="text-[11px] text-text-muted">{user.area} – {user.pincode}</p>
          )}
        </div>
      </ScCard>

      <div className="flex flex-col gap-2">
        <Link href="/bookings">
          <ScCard className="text-[13px] text-text-primary">My bookings</ScCard>
        </Link>
        <ScCard className="text-[13px] text-text-primary">Saved vehicles</ScCard>
        <ScCard className="text-[13px] text-text-primary">Saved addresses</ScCard>
      </div>

      <ScButton variant="secondary" onClick={handleLogout}>
        <span className="flex items-center justify-center gap-2">
          <IconLogout size={18} />
          Log out
        </span>
      </ScButton>
    </AppShell>
  )
}
