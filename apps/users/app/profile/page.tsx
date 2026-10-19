'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import {
  IconCamera,
  IconCar,
  IconChevronRight,
  IconLogout,
  IconMapPin,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react'
import { MyComplaints } from '@/components/complaints/my-complaints'
import { CustomerShell } from '@/components/customer-shell'
import { isHomeHubEnabled } from '@/lib/home-hub'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@/components/ui/card'
import { ScInput } from '@repo/ui/sc/input'
import { TopBar } from '@repo/ui/sc/top-bar'
import { Chip } from '@repo/ui/sc/chip'
import { SupportCard } from '@repo/ui/features/support-card'
import {
  createAddress,
  createVehicle,
  deleteAddress,
  deleteVehicle,
  setDefaultAddress,
  setDefaultVehicle,
} from '@repo/core/api/users'
import { toast } from 'react-toastify'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useUserStore } from '@repo/core/stores/user-store'
import {
  LocationPicker,
  type PickedLocation,
} from '@repo/ui/features/location-picker'
import { VEHICLE_TIERS } from '@repo/core/vehicles'
import { usePendingCheckoutStore } from '@repo/core/stores/pending-checkout-store'
import { invalidateHome } from '@repo/core/api/hooks/use-home'
import { getPushConfig } from '@repo/core/api/push'
import {
  giftsEnabled,
  useGiftsConfig,
  useMyCredit,
} from '@repo/core/api/hooks/use-gifts'
import { Figures } from '@repo/ui/sc/figures'
import {
  rewardsEnabled,
  useRewardsConfig,
  useRewardsSummary,
} from '@repo/core/api/hooks/use-rewards'
import { stampsToGoLine } from '@repo/core/rewards'
import { LevelBadge } from '@/components/rewards/level-badge'
import { giftRupees } from '@/lib/gifts'
import { useSlotAlerts } from '@repo/core/api/hooks/use-slot-alerts'
import { useMyCoupons } from '@repo/core/api/hooks/use-coupons'
import { couponsForCheckout } from '@/lib/coupons'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  NO_PIN_TEXT,
  refillFromPin,
  type PinText,
} from '@/components/pin-autofill'
import { LEGAL_LINKS } from '@/lib/legal/routes'

type VehicleType = 'sedan' | 'suv' | 'hatchback'

// The bookable tiers, shared with per-vehicle service pricing so a customer
// can never register a vehicle no service can be priced for.
const VEHICLE_TYPES = VEHICLE_TIERS

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
  pincode: '',
  // Null until the customer pins it. Optional on purpose: an address with text
  // but no pin books a drop-in slot perfectly well, and is prompted for a pin at
  // the one moment it matters — picking it for a doorstep booking.
  pin: null as PickedLocation | null,
}

export default function ProfilePage() {
  const authUser = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const profile = useUserStore((s) => s.profile)
  const vehicles = useUserStore((s) => s.vehicles)
  // Home's car hero follows the saved cars: a car added, removed or made the
  // default here shows there on the next look, not up to 30 seconds later.
  const queryClient = useQueryClient()
  const addresses = useUserStore((s) => s.addresses)
  const fetchProfile = useUserStore((s) => s.fetchProfile)
  const fetchVehicles = useUserStore((s) => s.fetchVehicles)
  const fetchAddresses = useUserStore((s) => s.fetchAddresses)
  const uploadAvatar = useUserStore((s) => s.uploadAvatar)
  const removeAvatar = useUserStore((s) => s.removeAvatar)
  const resetUser = useUserStore((s) => s.reset)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm)
  const [addressForm, setAddressForm] = useState(emptyAddressForm)
  // What the last pin wrote into the address text — see refillFromPin.
  const addressPinText = useRef<PinText>(NO_PIN_TEXT)
  const [saving, setSaving] = useState<'vehicle' | 'address' | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  // Shares one id across cars and addresses: only one row is ever mid-request,
  // and the two lists cannot collide on a uuid.
  const [promoting, setPromoting] = useState<string | null>(null)
  // Notifications shows only once the API has them set up (0044).
  const [pushOn, setPushOn] = useState(false)
  // Gift a wash and Detlio credit show only while the API has gifts on
  // (0049); loading or a failed read counts as off.
  const giftsConfig = useGiftsConfig()
  const giftsOn = giftsEnabled(giftsConfig.data)
  const credit = useMyCredit(giftsOn && !!authUser)
  const rewardsConfig = useRewardsConfig()
  const rewardsOn = rewardsEnabled(rewardsConfig.data) && !!authUser
  const rewardsSummary = useRewardsSummary(rewardsOn)

  // Slot alerts shows while any are waiting (0047).
  const slotAlertCount =
    useSlotAlerts({ enabled: !!authUser }).data?.items.length ?? 0
  // Coupons ready to use (0056), counted on the Coupons row.
  const readyCoupons = couponsForCheckout(useMyCoupons(!!authUser).data).length

  const user = profile ?? authUser

  useEffect(() => {
    if (!authUser) return
    void fetchProfile().catch(() => undefined)
    void fetchVehicles().catch(() => undefined)
    void fetchAddresses().catch(() => undefined)
  }, [authUser, fetchProfile, fetchVehicles, fetchAddresses])

  useEffect(() => {
    if (!authUser) return
    let cancelled = false
    getPushConfig('customer')
      .then((config) => {
        if (!cancelled) setPushOn(config.enabled)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [authUser])

  if (!authUser) {
    return (
      <CustomerShell showNav className="gap-4 py-4">
        <TopBar title="Profile" large={isHomeHubEnabled()} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-[15px] font-semibold text-text-primary">
            Login to view your profile
          </p>
          <p className="text-[13px] text-text-secondary">
            Sign in to manage your vehicles and addresses
          </p>
          <ScButton
            variant="main"
            className="mt-2 w-auto px-8"
            onClick={() => (window.location.href = '/login')}
          >
            Login
          </ScButton>
        </div>
      </CustomerShell>
    )
  }

  const handleLogout = async () => {
    await logout()
    resetUser()
    // Home's pending offer code and car are this account's, not the next one's.
    usePendingCheckoutStore.getState().clear()
    window.location.href = '/login'
  }

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Use a JPEG, PNG or WebP image')
      return
    }
    setAvatarBusy(true)
    try {
      await uploadAvatar(file)
      toast.success('Photo updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setAvatarBusy(false)
    }
  }

  const handleAvatarRemove = async () => {
    setAvatarBusy(true)
    try {
      await removeAvatar()
      toast.success('Photo removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove photo')
    } finally {
      setAvatarBusy(false)
    }
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
      void invalidateHome(queryClient)
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
    if (
      !addressForm.label ||
      !addressForm.address ||
      !addressForm.city ||
      !addressForm.pincode
    )
      return
    if (!/^\d{6}$/.test(addressForm.pincode)) {
      toast.error('Enter a valid 6-digit pincode')
      return
    }
    setSaving('address')
    try {
      const created = await createAddress({
        label: addressForm.label,
        address: `${addressForm.address}, ${addressForm.pincode}`,
        city: addressForm.city,
        // Previously hardcoded to a single Chennai point for every address ever
        // saved, which made doorstep radius checks meaningless.
        lat: addressForm.pin?.lat,
        lng: addressForm.pin?.lng,
        geoSource: addressForm.pin?.source,
        isDefault: addresses.length === 0,
      })
      useUserStore.setState((s) => ({ addresses: [...s.addresses, created] }))
      setAddressForm(emptyAddressForm)
      addressPinText.current = NO_PIN_TEXT
      setShowAddressForm(false)
      toast.success('Address added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add address')
    } finally {
      setSaving(null)
    }
  }

  // The default is what the booking page preselects, so changing it is the
  // point of the badge rather than decoration on it. Both lists write the
  // whole collection back from the response's `isDefault`, since promoting one
  // demotes whichever held it before.
  const makeVehicleDefault = async (id: string) => {
    setPromoting(id)
    try {
      await setDefaultVehicle(id)
      useUserStore.setState((s) => ({
        vehicles: s.vehicles.map((v) => ({ ...v, isDefault: v.id === id })),
      }))
      void invalidateHome(queryClient)
      toast.success('Default vehicle updated')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to set default vehicle'
      )
    } finally {
      setPromoting(null)
    }
  }

  const makeAddressDefault = async (id: string) => {
    setPromoting(id)
    try {
      await setDefaultAddress(id)
      useUserStore.setState((s) => ({
        addresses: s.addresses.map((a) => ({ ...a, isDefault: a.id === id })),
      }))
      toast.success('Default address updated')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to set default address'
      )
    } finally {
      setPromoting(null)
    }
  }

  const removeVehicle = async (id: string) => {
    setDeleting(id)
    try {
      await deleteVehicle(id)
      useUserStore.setState((s) => ({
        vehicles: s.vehicles.filter((v) => v.id !== id),
      }))
      void invalidateHome(queryClient)
      toast.success('Vehicle removed')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to remove vehicle'
      )
    } finally {
      setDeleting(null)
    }
  }

  const removeAddress = async (id: string) => {
    setDeleting(id)
    try {
      await deleteAddress(id)
      useUserStore.setState((s) => ({
        addresses: s.addresses.filter((a) => a.id !== id),
      }))
      toast.success('Address removed')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to remove address'
      )
    } finally {
      setDeleting(null)
    }
  }

  return (
    <CustomerShell showNav className="gap-4 py-4">
      <TopBar title="Profile" large={isHomeHubEnabled()} />

      <ScCard className="flex items-center gap-3">
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={handleAvatarPick}
        />
        <button
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          disabled={avatarBusy}
          aria-label="Change profile photo"
          className="relative h-12 w-12 shrink-0 disabled:opacity-60"
        >
          {user?.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              // The button around it is named; the picture adds nothing.
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            // Graphite and white, like the icon tiles below. Red on this
            // screen is kept for the Add actions.
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated text-lg font-semibold text-text-primary">
              {user?.name?.slice(0, 1) ?? '?'}
            </span>
          )}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-brand-white text-brand-black">
            <IconCamera size={11} />
          </span>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-text-primary">
            {user?.name}
          </p>
          <p className="text-[12px] text-text-secondary">+91 {user?.phone}</p>
          {user?.area && (
            <p className="text-[11px] text-text-muted">
              {user.area} – {user.pincode}
            </p>
          )}
          {user?.avatarUrl && (
            <button
              type="button"
              onClick={handleAvatarRemove}
              disabled={avatarBusy}
              className="tap-target mt-1 text-[11px] text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
            >
              Remove photo
            </button>
          )}
        </div>
      </ScCard>

      <Link href="/bookings">
        <ScCard className="text-[13px] text-text-primary">My bookings</ScCard>
      </Link>

      {/* The garages saved with the heart. A plain link, like My bookings. */}
      <Link href="/profile/saved-garages">
        <ScCard className="text-[13px] text-text-primary">Saved garages</ScCard>
      </Link>

      {/* The days waited on with "Notify me if a slot opens" (0047), while
          there are any. */}
      {slotAlertCount > 0 && (
        <Link href="/profile/slot-alerts">
          <ScCard className="flex items-center justify-between text-[13px] text-text-primary">
            Slot alerts
            <span className="font-numeric text-[12px] text-text-secondary">
              {slotAlertCount}
            </span>
          </ScCard>
        </Link>
      )}

      {/* Printed coupons (0056): type or scan a coupon's code, and the
          coupons added. Always there: a coupon works with or without
          Rewards. */}
      <Link href="/profile/coupons">
        <ScCard className="flex items-center justify-between gap-3 text-[13px] text-text-primary">
          <span className="min-w-0">
            Coupons
            <span className="block text-[12px] text-text-secondary">
              Have a coupon? Add it here
            </span>
          </span>
          {readyCoupons > 0 && (
            <span className="font-numeric text-[12px] text-text-secondary">
              {readyCoupons}
            </span>
          )}
        </ScCard>
      </Link>

      {/* Detlio Rewards (0050): the level badge and how far the Shine Card is. */}
      {rewardsOn && (
        <Link href="/profile/rewards">
          <ScCard className="flex items-center justify-between gap-3 text-[13px] text-text-primary">
            <span className="min-w-0">
              Detlio Rewards
              {rewardsSummary.data && (
                <span className="block text-[12px] text-text-secondary">
                  <Figures
                    text={stampsToGoLine(rewardsSummary.data.card.toGo)}
                  />
                  {/* 0054: the badge count. */}
                  {rewardsSummary.data.extras &&
                    rewardsSummary.data.extras.badgesEarned > 0 && (
                      <Figures
                        text={` · ${rewardsSummary.data.extras.badgesEarned} ${rewardsSummary.data.extras.badgesEarned === 1 ? 'badge' : 'badges'}`}
                      />
                    )}
                </span>
              )}
            </span>
            {rewardsSummary.data && (
              <LevelBadge
                level={rewardsSummary.data.level.level}
                label={rewardsSummary.data.level.label}
              />
            )}
          </ScCard>
        </Link>
      )}

      {/* Detlio credit, with the balance once it is known, and the gifts
          bought (0049). Plain links, like the rows above. */}
      {giftsOn && (
        <>
          <Link href="/profile/credit">
            <ScCard className="flex items-center justify-between gap-3 text-[13px] text-text-primary">
              Detlio credit
              {credit.data && (
                <span className="font-numeric text-[13px] text-text-secondary">
                  {giftRupees(credit.data.balance)}
                </span>
              )}
            </ScCard>
          </Link>
          <Link href="/profile/gifts">
            <ScCard className="text-[13px] text-text-primary">
              Gift a wash
            </ScCard>
          </Link>
        </>
      )}

      {/* Browser notifications on this device, and what to send (0044). */}
      {pushOn && (
        <Link href="/profile/notifications">
          <ScCard className="text-[13px] text-text-primary">
            Notifications
          </ScCard>
        </Link>
      )}

      {/* #vehicles: Home's pencil on the car opens here. */}
      <section id="vehicles" className="scroll-mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Vehicles</h2>
          <button
            type="button"
            onClick={() => setShowVehicleForm((v) => !v)}
            // Both section headers render a button reading "Add", which on its
            // own tells a screen reader nothing about what is being added.
            aria-label="Add vehicle"
            className="-my-2.5 -mr-2 flex min-h-11 items-center gap-1 px-2 text-[13px] text-text-primary"
          >
            <IconPlus size={14} aria-hidden="true" />
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
                onChange={(e) =>
                  setVehicleForm({ ...vehicleForm, make: e.target.value })
                }
              />
              <ScInput
                label="Model"
                placeholder="e.g. Swift"
                value={vehicleForm.model}
                onChange={(e) =>
                  setVehicleForm({ ...vehicleForm, model: e.target.value })
                }
              />
            </div>
            <ScInput
              label="License plate (optional)"
              placeholder="e.g. TN 01 AB 1234"
              value={vehicleForm.licensePlate}
              onChange={(e) =>
                setVehicleForm({
                  ...vehicleForm,
                  licensePlate: e.target.value.toUpperCase(),
                })
              }
            />
            <div>
              <p className="mb-2 text-[11px] font-medium text-text-secondary">
                Type
              </p>
              <div className="flex gap-2">
                {VEHICLE_TYPES.map((t) => (
                  <Chip
                    key={t.value}
                    label={t.label}
                    selected={vehicleForm.vehicleType === t.value}
                    onClick={() =>
                      setVehicleForm({ ...vehicleForm, vehicleType: t.value })
                    }
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <ScButton
                variant="main"
                disabled={
                  !vehicleForm.make ||
                  !vehicleForm.model ||
                  saving === 'vehicle'
                }
                onClick={submitVehicle}
              >
                {saving === 'vehicle' ? 'Saving...' : 'Save vehicle'}
              </ScButton>
              <ScButton
                variant="secondary"
                onClick={() => setShowVehicleForm(false)}
              >
                Cancel
              </ScButton>
            </div>
          </ScCard>
        )}

        <div className="flex flex-col gap-2">
          {vehicles.length === 0 && !showVehicleForm ? (
            <ScCard>
              <p className="text-[12px] text-text-secondary">
                No vehicles added yet.
              </p>
            </ScCard>
          ) : (
            vehicles.map((v) => (
              <ScCard key={v.id} className="flex items-center gap-3">
                {/* The car opens its history: every job, receipts, photos
                    and its next coating or detailing reminder. */}
                <Link
                  href={`/profile/cars/${v.id}`}
                  aria-label={`${v.make} ${v.model}: history`}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-surface-elevated">
                    <IconCar
                      size={18}
                      className="text-text-primary"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-0.5 text-[13px] font-medium text-text-primary">
                      <span className="truncate">
                        {v.make} {v.model}
                      </span>
                      <IconChevronRight
                        size={14}
                        className="shrink-0 text-text-muted"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="block text-[11px] text-text-secondary">
                      {v.plate ? `${v.plate} · History` : 'History'}
                    </span>
                  </span>
                </Link>
                {v.isDefault ? (
                  <ScBadge variant="success">Default</ScBadge>
                ) : (
                  <button
                    type="button"
                    aria-label={`Make ${v.make} ${v.model} the default vehicle`}
                    onClick={() => makeVehicleDefault(v.id)}
                    disabled={promoting === v.id}
                    className="-my-1 min-h-11 shrink-0 rounded-[6px] px-2 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
                  >
                    {promoting === v.id ? 'Setting...' : 'Set default'}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${v.make} ${v.model}`}
                  onClick={() => removeVehicle(v.id)}
                  disabled={deleting === v.id}
                  // 44px around the 16px bin, mostly out into the card's
                  // own padding so the row barely widens.
                  className="-my-2 -ml-1 -mr-3 flex size-11 shrink-0 items-center justify-center text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
                >
                  <IconTrash size={16} aria-hidden="true" />
                </button>
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
            aria-label="Add address"
            className="-my-2.5 -mr-2 flex min-h-11 items-center gap-1 px-2 text-[13px] text-text-primary"
          >
            <IconPlus size={14} aria-hidden="true" />
            Add
          </button>
        </div>

        {showAddressForm && (
          <ScCard className="mb-2 flex flex-col gap-3">
            <ScInput
              label="Label"
              placeholder="e.g. Home, Work"
              value={addressForm.label}
              onChange={(e) =>
                setAddressForm({ ...addressForm, label: e.target.value })
              }
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-text-secondary">
                Pin the exact spot (optional)
              </span>
              <p className="text-[11px] text-text-muted">
                Needed only for doorstep and pickup &amp; drop — we&apos;ll ask
                before your first one if you skip it.
              </p>
              {/* GPS-first for customers: they are usually standing at the
                  address they are saving, unlike a garage owner onboarding. */}
              <LocationPicker
                showSearch
                value={
                  addressForm.pin
                    ? { lat: addressForm.pin.lat, lng: addressForm.pin.lng }
                    : null
                }
                onChange={(picked) => {
                  const previous = addressPinText.current
                  addressPinText.current = {
                    address: picked.address,
                    city: picked.city,
                  }
                  setAddressForm((form) =>
                    refillFromPin(
                      {
                        ...form,
                        pin: picked,
                        pincode: picked.pincode || form.pincode,
                      },
                      picked,
                      previous
                    )
                  )
                }}
              />
            </div>
            <ScInput
              label="Address"
              placeholder="Street, area"
              value={addressForm.address}
              onChange={(e) =>
                setAddressForm({ ...addressForm, address: e.target.value })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <ScInput
                label="City"
                placeholder="e.g. Chennai"
                value={addressForm.city}
                onChange={(e) =>
                  setAddressForm({ ...addressForm, city: e.target.value })
                }
              />
              <ScInput
                label="Pincode"
                inputMode="numeric"
                maxLength={6}
                placeholder="600001"
                value={addressForm.pincode}
                onChange={(e) =>
                  setAddressForm({
                    ...addressForm,
                    pincode: e.target.value.replace(/\D/g, '').slice(0, 6),
                  })
                }
              />
            </div>
            <div className="flex gap-2">
              <ScButton
                variant="main"
                disabled={
                  !addressForm.label ||
                  !addressForm.address ||
                  !addressForm.city ||
                  !addressForm.pincode ||
                  saving === 'address'
                }
                onClick={submitAddress}
              >
                {saving === 'address' ? 'Saving...' : 'Save address'}
              </ScButton>
              <ScButton
                variant="secondary"
                onClick={() => setShowAddressForm(false)}
              >
                Cancel
              </ScButton>
            </div>
          </ScCard>
        )}

        <div className="flex flex-col gap-2">
          {addresses.length === 0 && !showAddressForm ? (
            <ScCard>
              <p className="text-[12px] text-text-secondary">
                No addresses added yet.
              </p>
            </ScCard>
          ) : (
            addresses.map((a) => (
              <ScCard key={a.id} className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-surface-elevated">
                  <IconMapPin size={18} className="text-text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-text-primary">
                    {a.label}
                  </p>
                  <p className="text-[11px] text-text-secondary truncate">
                    {a.address}
                  </p>
                  {a.pincode && (
                    <p className="text-[11px] text-text-muted">{a.pincode}</p>
                  )}
                </div>
                {a.isDefault ? (
                  <ScBadge variant="success">Default</ScBadge>
                ) : (
                  <button
                    type="button"
                    aria-label={`Make ${a.label} the default address`}
                    onClick={() => makeAddressDefault(a.id)}
                    disabled={promoting === a.id}
                    className="-my-1 min-h-11 shrink-0 rounded-[6px] px-2 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
                  >
                    {promoting === a.id ? 'Setting...' : 'Set default'}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${a.label} address`}
                  onClick={() => removeAddress(a.id)}
                  disabled={deleting === a.id}
                  // 44px around the 16px bin, mostly out into the card's
                  // own padding so the row barely widens.
                  className="-my-2 -ml-1 -mr-3 flex size-11 shrink-0 items-center justify-center text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
                >
                  <IconTrash size={16} aria-hidden="true" />
                </button>
              </ScCard>
            ))
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Support</h2>
        {/* The answers first: most questions do not need a call. */}
        <ScCard className="px-0 py-1">
          <Link
            href="/help"
            className="flex items-center justify-between px-3.5 py-2.5 text-[13px] text-text-primary transition-colors hover:text-brand-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-white"
          >
            Help centre
            <IconChevronRight
              size={16}
              className="text-text-muted"
              aria-hidden="true"
            />
          </Link>
        </ScCard>
        <SupportCard />
      </section>

      <MyComplaints />

      {/* The five legal pages, one tap from the account they govern. Plain
          links in one card, like My bookings above: nothing here is an
          action, so nothing is red. */}
      <section aria-labelledby="profile-legal">
        <h2 id="profile-legal" className="mb-2 text-sm font-semibold">
          Legal
        </h2>
        <ScCard className="px-0 py-1">
          <ul className="divide-y divide-border">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex items-center justify-between px-3.5 py-2.5 text-[13px] text-text-primary transition-colors hover:text-brand-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-white"
                >
                  {link.label}
                  <IconChevronRight
                    size={16}
                    className="text-text-muted"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </ScCard>
      </section>

      <ScButton variant="secondary" onClick={handleLogout}>
        <span className="flex items-center justify-center gap-2">
          <IconLogout size={18} />
          Log out
        </span>
      </ScButton>
    </CustomerShell>
  )
}
