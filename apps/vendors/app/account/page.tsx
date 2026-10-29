'use client'

import { IconLogout } from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { TopBar } from '@repo/ui/sc/top-bar'
import { SupportCard } from '@repo/ui/features/support-card'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { useUserStore } from '@repo/core/stores/user-store'
import { useVendorOnboardingStore } from '@repo/core/stores/vendor-onboarding-store'
import { AccountActions } from '@/components/account-actions'
import { ActiveGarage } from '@/components/active-garage'

/**
 * Your account (0066), for every seat: who is signed in, and the ways out.
 * An operator has no Settings tab, so this page is where they leave the
 * garage, delete their login or log out (opened from Home). The owner's
 * "Close my garage" is here too, as on Settings → Account.
 */
export default function AccountPage() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = async () => {
    await logout()
    useUserStore.getState().reset()
    useBookingsStore.getState().reset()
    useVendorOnboardingStore.getState().reset()
    window.location.href = '/login'
  }

  return (
    <AppShell showNav navType="vendor" showBrand brandRight={<ActiveGarage />} className="gap-5 py-4">
      <TopBar title="Your account" showBack backHref="/home" />

      {user && (
        <ScCard className="flex flex-col gap-0.5">
          <p className="text-[15px] font-semibold text-text-primary">{user.name}</p>
          <p className="font-numeric text-[13px] text-text-secondary">+91 {user.phone}</p>
        </ScCard>
      )}

      <AccountActions />

      <section className="flex flex-col gap-3">
        <SectionHeader title="Support" />
        <SupportCard />
      </section>

      <ScButton variant="outline" size="md" onClick={() => void handleLogout()} className="mb-4">
        <span className="flex items-center justify-center gap-2">
          <IconLogout size={18} aria-hidden="true" />
          Log out
        </span>
      </ScButton>
    </AppShell>
  )
}
