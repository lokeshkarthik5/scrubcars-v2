'use client'

import { useEffect, useState } from 'react'
import { IconCar, IconLogout, IconMapPin, IconPlus } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { ScBadge } from '@/components/sc/badge'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { ScInput } from '@/components/sc/input'
import { TopBar } from '@/components/sc/top-bar'
import { Chip } from '@/components/sc/chip'
import { createAddress, createVehicle } from '@/lib/api/users'
import { toast } from 'react-toastify'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useUserStore } from '@/lib/stores/user-store'
import Link from 'next/link'

type VehicleType = 'sedan' | 'suv' | 'hatchback'

const VEHICLE_TYPES: Array<{ value: VehicleType; label: string }> = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'hatchback', label: 'Hatchback' },
]

const emptyVehicleForm = {
  make: '',
  model: '',
  licensePlate: '',
  vehicleType: 'sedan' as VehicleType,
}

const emptyAddressForm = {
  label: '',
  address: '',
  city: '',
}

export default function ProfilePage() {
  const authUser = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const profile = useUserStore((s) => s.profile)
  const vehicles = useUserStore((s) => s.vehicles)
  const addresses = useUserStore((s) => s.addresses)
  const fetchProfile = useUserStore((s) => s.fetchProfile)
  const fetchVehicles = useUserStore((s) => s.fetchVehicles)
  const fetchAddresses = useUserStore((s) => s.fetchAddresses)
  const resetUser = useUserStore((s) => s.reset)
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm)
  const [addressForm, setAddressForm] = useState(emptyAddressForm)
  const [saving, setSaving] = useState<'vehicle' | 'address' | null>(null)

  const user = profile ?? authUser

  useEffect(() => {
    void fetchProfile().catch(() => undefined)
    void fetchVehicles().catch(() => undefined)
    void fetchAddresses().catch(() => undefined)
  }, [fetchProfile, fetchVehicles, fetchAddresses])

  const handleLogout = async () => {
    await logout()
    resetUser()
    window.location.href = '/login'
  }

  const submitVehicle = async () => {
    if (!vehicleForm.make || !vehicleForm.model) return
    setSaving('vehicle')
    try {
      const created = await createVehicle({
        make: vehicleForm.make,
        model: vehicleForm.model,
        licensePlate: vehicleForm.licensePlate || undefined,
        vehicleType: vehicleForm.vehicleType,
        isDefault: vehicles.length === 0,
      })
      useUserStore.setState((s) => ({ vehicles: [...s.vehicles, created] }))
      setVehicleForm(emptyVehicleForm)
      setShowVehicleForm(false)
      toast.success('Vehicle added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add vehicle')
    } finally {
      setSaving(null)
    }
  }

  const submitAddress = async () => {
    if (!addressForm.label || !addressForm.address || !addressForm.city) return
    setSaving('address')
    try {
      const created = await createAddress({
        label: addressForm.label,
        address: addressForm.address,
        city: addressForm.city,
        lat: 13.0067,
        lng: 80.2574,
        isDefault: addresses.length === 0,
      })
      useUserStore.setState((s) => ({ addresses: [...s.addresses, created] }))
      setAddressForm(emptyAddressForm)
      setShowAddressForm(false)
      toast.success('Address added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add address')
    } finally {
      setSaving(null)
    }
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

      <Link href="/bookings">
        <ScCard className="text-[13px] text-text-primary">My bookings</ScCard>
      </Link>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Vehicles</h2>
          <button
            type="button"
            onClick={() => setShowVehicleForm((v) => !v)}
            className="flex items-center gap-1 text-[12px] text-brand-red"
          >
            <IconPlus size={14} />
            Add
          </button>
        </div>

        {showVehicleForm && (
          <ScCard className="mb-2 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <ScInput
                label="Make"
                placeholder="e.g. Maruti"
                value={vehicleForm.make}
                onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })}
              />
              <ScInput
                label="Model"
                placeholder="e.g. Swift"
                value={vehicleForm.model}
                onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
              />
            </div>
            <ScInput
              label="License plate (optional)"
              placeholder="e.g. TN 01 AB 1234"
              value={vehicleForm.licensePlate}
              onChange={(e) => setVehicleForm({ ...vehicleForm, licensePlate: e.target.value.toUpperCase() })}
            />
            <div>
              <p className="mb-2 text-[11px] font-medium text-text-secondary">Type</p>
              <div className="flex gap-2">
                {VEHICLE_TYPES.map((t) => (
                  <Chip
                    key={t.value}
                    label={t.label}
                    selected={vehicleForm.vehicleType === t.value}
                    onClick={() => setVehicleForm({ ...vehicleForm, vehicleType: t.value })}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <ScButton
                disabled={!vehicleForm.make || !vehicleForm.model || saving === 'vehicle'}
                onClick={submitVehicle}
              >
                {saving === 'vehicle' ? 'Saving...' : 'Save vehicle'}
              </ScButton>
              <ScButton variant="secondary" onClick={() => setShowVehicleForm(false)}>
                Cancel
              </ScButton>
            </div>
          </ScCard>
        )}

        <div className="flex flex-col gap-2">
          {vehicles.length === 0 && !showVehicleForm ? (
            <ScCard>
              <p className="text-[12px] text-text-secondary">No vehicles added yet.</p>
            </ScCard>
          ) : (
            vehicles.map((v) => (
              <ScCard key={v.id} className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-accent-muted">
                  <IconCar size={18} className="text-brand-red" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-text-primary">{v.make} {v.model}</p>
                  {v.plate && (
                    <p className="text-[11px] text-text-secondary">{v.plate}</p>
                  )}
                </div>
                {v.isDefault && <ScBadge variant="success">Default</ScBadge>}
              </ScCard>
            ))
          )}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Addresses</h2>
          <button
            type="button"
            onClick={() => setShowAddressForm((a) => !a)}
            className="flex items-center gap-1 text-[12px] text-brand-red"
          >
            <IconPlus size={14} />
            Add
          </button>
        </div>

        {showAddressForm && (
          <ScCard className="mb-2 flex flex-col gap-3">
            <ScInput
              label="Label"
              placeholder="e.g. Home, Work"
              value={addressForm.label}
              onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value })}
            />
            <ScInput
              label="Address"
              placeholder="Street, area"
              value={addressForm.address}
              onChange={(e) => setAddressForm({ ...addressForm, address: e.target.value })}
            />
            <ScInput
              label="City"
              placeholder="e.g. Chennai"
              value={addressForm.city}
              onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
            />
            <div className="flex gap-2">
              <ScButton
                disabled={!addressForm.label || !addressForm.address || !addressForm.city || saving === 'address'}
                onClick={submitAddress}
              >
                {saving === 'address' ? 'Saving...' : 'Save address'}
              </ScButton>
              <ScButton variant="secondary" onClick={() => setShowAddressForm(false)}>
                Cancel
              </ScButton>
            </div>
          </ScCard>
        )}

        <div className="flex flex-col gap-2">
          {addresses.length === 0 && !showAddressForm ? (
            <ScCard>
              <p className="text-[12px] text-text-secondary">No addresses added yet.</p>
            </ScCard>
          ) : (
            addresses.map((a) => (
              <ScCard key={a.id} className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-accent-muted">
                  <IconMapPin size={18} className="text-brand-red" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-text-primary">{a.label}</p>
                  <p className="text-[11px] text-text-secondary truncate">{a.address}</p>
                </div>
                {a.isDefault && <ScBadge variant="success">Default</ScBadge>}
              </ScCard>
            ))
          )}
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
