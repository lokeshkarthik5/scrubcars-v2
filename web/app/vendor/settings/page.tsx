'use client'

import { useEffect, useState } from 'react'
import { IconLogout } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { ScBadge } from '@/components/sc/badge'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { ScInput } from '@/components/sc/input'
import { TopBar } from '@/components/sc/top-bar'
import { Chip } from '@/components/sc/chip'
import {
  getMyVendor,
  getWorkingHours,
  setVendorWorkingHours,
  updateSlotInterval,
  updateVendorSettings,
} from '@/lib/api/vendors'
import type {
  ApiVendorProfile,
  ApiWorkingHours,
} from '@/lib/api/types'
import { toast } from 'react-toastify'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useBookingsStore } from '@/lib/stores/bookings-store'
import { useUserStore } from '@/lib/stores/user-store'
import { useVendorOnboardingStore } from '@/lib/stores/vendor-onboarding-store'
import { cn } from '@/lib/utils'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SLOT_INTERVALS = [30, 45, 60] as const

type WorkingHoursForm = {
  dayOfWeek: number
  openTime: string
  closeTime: string
  isClosed: boolean
}

function normalizeTimeForInput(time: string) {
  return time.slice(0, 5)
}

function normalizeTimeForApi(time: string) {
  return time.length === 5 ? `${time}:00` : time
}

function defaultWorkingHours(): WorkingHoursForm[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: '09:00',
    closeTime: '18:00',
    isClosed: false,
  }))
}

function mapWorkingHours(hours: ApiWorkingHours[]): WorkingHoursForm[] {
  const byDay = new Map(hours.map((day) => [day.dayOfWeek, day]))
  return defaultWorkingHours().map((fallback) => {
    const day = byDay.get(fallback.dayOfWeek)
    return day
      ? {
          dayOfWeek: day.dayOfWeek,
          openTime: normalizeTimeForInput(day.openTime),
          closeTime: normalizeTimeForInput(day.closeTime),
          isClosed: day.isClosed,
        }
      : fallback
  })
}

export default function VendorSettingsPage() {
  const [vendor, setVendor] = useState<ApiVendorProfile | null>(null)
  const [profileForm, setProfileForm] = useState({
    businessName: '',
    phone: '',
    address: '',
    city: '',
  })
  const [workingHours, setWorkingHours] = useState<WorkingHoursForm[]>(
    defaultWorkingHours()
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const logout = useAuthStore((s) => s.logout)
  const resetUser = useUserStore((s) => s.reset)
  const resetBookings = useBookingsStore((s) => s.reset)
  const resetOnboarding = useVendorOnboardingStore((s) => s.reset)

  useEffect(() => {
    async function loadSettings() {
      setLoading(true)
      try {
        const [vendorData, hoursData] = await Promise.all([
          getMyVendor(),
          getWorkingHours(),
        ])

        setVendor(vendorData)
        setProfileForm({
          businessName: vendorData.businessName,
          phone: vendorData.phone,
          address: vendorData.address,
          city: vendorData.city,
        })
        setWorkingHours(mapWorkingHours(hoursData))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load settings')
      } finally {
        setLoading(false)
      }
    }

    void loadSettings()
  }, [])

  const runAction = async (key: string, action: () => Promise<void>) => {
    setSaving(key)
    try {
      await action()
      toast.success('Saved successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(null)
    }
  }

  const saveProfile = () =>
    vendor &&
    runAction('profile', async () => {
      const updated = await updateVendorSettings({
        businessName: profileForm.businessName,
        phone: profileForm.phone,
        address: profileForm.address,
        city: profileForm.city,
        lat: vendor.lat,
        lng: vendor.lng,
      })
      setVendor(updated)
    })

  const saveSlotInterval = (slotIntervalMins: 30 | 45 | 60) =>
    runAction('slot-interval', async () => {
      const updated = await updateSlotInterval(slotIntervalMins)
      setVendor(updated)
    })

  const saveWorkingHours = () =>
    runAction('working-hours', async () => {
      const updated = await setVendorWorkingHours(
        workingHours.map((day) => ({
          ...day,
          openTime: normalizeTimeForApi(day.openTime),
          closeTime: normalizeTimeForApi(day.closeTime),
        }))
      )
      setWorkingHours(mapWorkingHours(updated))
    })

  const handleLogout = async () => {
    await logout()
    resetUser()
    resetBookings()
    resetOnboarding()
    window.location.href = '/vendor/login'
  }

  if (loading) {
    return (
      <AppShell showNav navType="vendor" className="gap-5 py-4">
        <TopBar title="Settings" />
        <p className="text-[13px] text-text-secondary">Loading settings...</p>
      </AppShell>
    )
  }

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <TopBar title="Settings" />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Profile</h2>
          {vendor && (
            <ScBadge variant={vendor.isVerified ? 'success' : 'pending'}>
              {vendor.isVerified ? 'Verified' : 'Under review'}
            </ScBadge>
          )}
        </div>
        <ScCard className="flex flex-col gap-3">
          <ScInput
            label="Business name"
            value={profileForm.businessName}
            onChange={(e) =>
              setProfileForm({ ...profileForm, businessName: e.target.value })
            }
          />
          <ScInput
            label="Phone"
            value={profileForm.phone}
            onChange={(e) =>
              setProfileForm({
                ...profileForm,
                phone: e.target.value.replace(/\D/g, '').slice(0, 10),
              })
            }
          />
          <ScInput
            label="Address"
            value={profileForm.address}
            onChange={(e) =>
              setProfileForm({ ...profileForm, address: e.target.value })
            }
          />
          <ScInput
            label="City"
            value={profileForm.city}
            onChange={(e) =>
              setProfileForm({ ...profileForm, city: e.target.value })
            }
          />
          <ScButton disabled={saving === 'profile'} onClick={saveProfile}>
            {saving === 'profile' ? 'Saving...' : 'Save profile'}
          </ScButton>
        </ScCard>
      </section>

      {vendor && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Slot interval</h2>
          <ScCard>
            <div className="flex gap-2">
              {SLOT_INTERVALS.map((interval) => (
                <Chip
                  key={interval}
                  label={`${interval} min`}
                  selected={vendor.slotIntervalMins === interval}
                  onClick={() => saveSlotInterval(interval)}
                  disabled={saving === 'slot-interval'}
                />
              ))}
            </div>
          </ScCard>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Working hours</h2>
        <div className="flex flex-col gap-2">
          {workingHours.map((day) => (
            <ScCard
              key={day.dayOfWeek}
              className={cn('flex items-center gap-2', day.isClosed && 'opacity-50')}
            >
              <span className="w-8 text-[12px] font-medium">{DAYS[day.dayOfWeek]}</span>
              <input
                type="time"
                value={day.openTime}
                onChange={(e) =>
                  setWorkingHours((current) =>
                    current.map((item) =>
                      item.dayOfWeek === day.dayOfWeek
                        ? { ...item, openTime: e.target.value }
                        : item
                    )
                  )
                }
                className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-[12px]"
                disabled={day.isClosed}
              />
              <input
                type="time"
                value={day.closeTime}
                onChange={(e) =>
                  setWorkingHours((current) =>
                    current.map((item) =>
                      item.dayOfWeek === day.dayOfWeek
                        ? { ...item, closeTime: e.target.value }
                        : item
                    )
                  )
                }
                className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-[12px]"
                disabled={day.isClosed}
              />
              <button
                type="button"
                onClick={() =>
                  setWorkingHours((current) =>
                    current.map((item) =>
                      item.dayOfWeek === day.dayOfWeek
                        ? { ...item, isClosed: !item.isClosed }
                        : item
                    )
                  )
                }
                className={cn(
                  'text-[10px] font-medium',
                  day.isClosed ? 'text-brand-red' : 'text-text-secondary'
                )}
              >
                {day.isClosed ? 'Closed' : 'Open'}
              </button>
            </ScCard>
          ))}
          <ScButton
            disabled={saving === 'working-hours'}
            onClick={saveWorkingHours}
          >
            {saving === 'working-hours' ? 'Saving...' : 'Save working hours'}
          </ScButton>
        </div>
      </section>

      <ScButton variant="secondary" onClick={handleLogout}>
        <span className="flex items-center justify-center gap-2">
          <IconLogout size={18} />
          Log out
        </span>
      </ScButton>
    </AppShell>
  )
}
