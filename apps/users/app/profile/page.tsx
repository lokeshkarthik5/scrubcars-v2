'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import {
  IconAward,
  IconBell,
  IconCamera,
  IconChevronRight,
  IconCookie,
  IconFileText,
  IconGift,
  IconHelpCircle,
  IconLogout,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react'
import {
  EditAddressSheet,
  EditProfileSheet,
  EditVehicleSheet,
} from '@/components/profile/edit-sheets'
import { DeleteAccountSheet } from '@/components/profile/delete-account-sheet'
import { LanguageRow } from '@/components/profile/language-row'
import { BringGarageHubCard } from '@/components/reach/bring-garage'
import {
  AddressMapBand,
  CarCards,
  HubList,
  HubPill,
  HubRow,
  HubSectionHead,
  ProfileStats,
  ProfileTiles,
  RowIcon,
  bookingFigures,
} from '@/components/profile/profile-hub'
import { useSavedGarages } from '@repo/core/api/hooks/use-favourites'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { MyComplaints } from '@/components/complaints/my-complaints'
import { CustomerShell } from '@/components/customer-shell'
import { isHomeHubEnabled } from '@/lib/home-hub'
import { ScButton } from '@repo/ui/sc/button'
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
import {
  NO_PIN_TEXT,
  refillFromPin,
  type PinText,
} from '@/components/pin-autofill'
import { LEGAL_LINKS } from '@/lib/legal/routes'
import { clearBookingDraft } from '@repo/core/booking-draft'
import { CookieSettingsButton } from '@/components/consent/cookie-settings-button'
import { tn, useT } from '@repo/core/i18n'

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
  const t = useT()
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
  // The Edit sheets and Delete account (0066): one open at a time.
  const [editingProfile, setEditingProfile] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<string | null>(null)
  const [editingAddress, setEditingAddress] = useState<string | null>(null)
  const [deletingAccount, setDeletingAccount] = useState(false)
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

  // The top card's figures and the bookings tile (22 Nov 2026): read once
  // here, as My bookings reads them. Null until they arrive, so no "0".
  const customerBookings = useBookingsStore((s) => s.customerBookings)
  const fetchCustomerBookings = useBookingsStore((s) => s.fetchCustomerBookings)
  const [bookingsRead, setBookingsRead] = useState(false)
  useEffect(() => {
    if (!authUser) return
    void fetchCustomerBookings()
      .then(() => setBookingsRead(true))
      .catch(() => undefined)
  }, [authUser, fetchCustomerBookings])
  const figures = bookingsRead ? bookingFigures(customerBookings) : null
  const savedGarages = useSavedGarages({ enabled: !!authUser })

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
        <TopBar title={t('Profile')} large={isHomeHubEnabled()} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-t3 font-semibold text-text-primary">
            {t('Login to view your profile')}
          </p>
          <p className="text-t4 text-text-secondary">
            {t('Sign in to manage your vehicles and addresses')}
          </p>
          <ScButton
            variant="main"
            className="mt-2 w-auto px-8"
            onClick={() => (window.location.href = '/login')}
          >
            {t('Login')}
          </ScButton>
        </div>
        {/* English or Tamil needs no account, as on the customer app. */}
        <LanguageRow />
      </CustomerShell>
    )
  }

  const handleLogout = async () => {
    await logout()
    resetUser()
    // Home's pending offer code and car are this account's, not the next one's.
    usePendingCheckoutStore.getState().clear()
    // So is a booking kept on the phone (0062): its address must not come
    // back in the next person's checkout.
    clearBookingDraft()
    window.location.href = '/login'
  }

  // The account is gone on the server (0066): this browser's session goes
  // too, without asking the API (the cookies are already cleared), then home.
  const finishDeletion = () => {
    useAuthStore.getState().clearSession()
    resetUser()
    usePendingCheckoutStore.getState().clear()
    clearBookingDraft()
    window.location.href = '/'
  }

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error(t('Use a JPEG, PNG or WebP image'))
      return
    }
    setAvatarBusy(true)
    try {
      await uploadAvatar(file)
      toast.success(t('Photo updated'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Upload failed'))
    } finally {
      setAvatarBusy(false)
    }
  }

  const handleAvatarRemove = async () => {
    setAvatarBusy(true)
    try {
      await removeAvatar()
      toast.success(t('Photo removed'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Failed to remove photo'))
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
      toast.success(t('Vehicle added'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Failed to add vehicle'))
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
      toast.error(t('Enter a valid 6-digit pincode'))
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
      toast.success(t('Address added'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Failed to add address'))
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
      toast.success(t('Default vehicle updated'))
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('Failed to set default vehicle')
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
      toast.success(t('Default address updated'))
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('Failed to set default address')
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
      toast.success(t('Vehicle removed'))
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('Failed to remove vehicle')
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
      toast.success(t('Address removed'))
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('Failed to remove address')
      )
    } finally {
      setDeleting(null)
    }
  }

  return (
    <CustomerShell showNav className="gap-3 py-4">
      <TopBar title={t('Profile')} large={isHomeHubEnabled()} />

      {/* You (22 Nov 2026, the Home look): the photo with its thin red ring,
          the name large, then three quiet figures. */}
      <section className="hub-card relative flex flex-col items-center px-5 pt-6 pb-5 text-center">
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={handleAvatarPick}
        />
        {/* Name and email (0066); the phone is the sign-in. */}
        <button
          type="button"
          aria-label={t('Edit name and email')}
          onClick={() => setEditingProfile(true)}
          className="absolute top-3 right-3 grid size-11 place-items-center rounded-full text-text-primary"
        >
          <span className="grid size-10 place-items-center rounded-full border border-line">
            <IconPencil size={16} aria-hidden="true" />
          </span>
        </button>
        <button
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          disabled={avatarBusy}
          aria-label={t('Change profile photo')}
          className="relative size-[88px] shrink-0 disabled:opacity-60"
        >
          {user?.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              // The button around it is named; the picture adds nothing.
              alt=""
              width={88}
              height={88}
              className="profile-avatar size-[88px] rounded-full object-cover"
            />
          ) : (
            <span className="profile-avatar flex size-[88px] items-center justify-center rounded-full bg-surface-elevated text-[32px] font-light text-text-primary">
              {user?.name?.slice(0, 1) ?? '?'}
            </span>
          )}
          <span className="absolute -right-0.5 -bottom-0.5 flex size-7 items-center justify-center rounded-full border-2 border-[#17171a] bg-brand-white text-brand-black">
            <IconCamera size={14} />
          </span>
        </button>
        <div className="mt-3.5 min-w-0 max-w-full" data-clarity-mask="true">
          <p className="profile-name truncate">{user?.name}</p>
          <p className="mt-1 text-t4 text-dim">
            +91 {user?.phone}
            {user?.area && (
              <>
                {' · '}
                {user.area} {user.pincode}
              </>
            )}
          </p>
        </div>
        {user?.avatarUrl && (
          <button
            type="button"
            onClick={handleAvatarRemove}
            disabled={avatarBusy}
            className="tap-target mt-1 text-t5 text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
          >
            {t('Remove photo')}
          </button>
        )}
        {figures && (
          <ProfileStats
            items={[
              { value: figures.count, label: tn(figures.count, 'Booking', 'Bookings') },
              { value: figures.garagesTried, label: t('Garages tried') },
              { value: vehicles.length, label: tn(vehicles.length, 'Car', 'Cars') },
            ]}
          />
        )}
      </section>

      {/* #vehicles: Home's pencil on the car opens here. */}
      <section id="vehicles" aria-label={t('Vehicles')} className="flex scroll-mt-4 flex-col gap-3">
        {vehicles.length === 0 && !showVehicleForm ? (
          <div className="hub-card p-5">
            <p className="text-t4 text-dim">{t('Your garage')}</p>
            <p className="mt-1 text-t3 text-text-secondary">{t('No vehicles added yet.')}</p>
          </div>
        ) : (
          <CarCards
            vehicles={vehicles}
            promoting={promoting}
            deleting={deleting}
            onEdit={setEditingVehicle}
            onRemove={removeVehicle}
            onMakeDefault={makeVehicleDefault}
          />
        )}

        {showVehicleForm ? (
          <div className="hub-card flex flex-col gap-3 p-5">
            <div className="grid grid-cols-2 gap-2">
              <ScInput
                data-clarity-mask="true"
                label={t('Make')}
                placeholder={t('e.g. Maruti')}
                value={vehicleForm.make}
                onChange={(e) =>
                  setVehicleForm({ ...vehicleForm, make: e.target.value })
                }
              />
              <ScInput
                data-clarity-mask="true"
                label={t('Model')}
                placeholder={t('e.g. Swift')}
                value={vehicleForm.model}
                onChange={(e) =>
                  setVehicleForm({ ...vehicleForm, model: e.target.value })
                }
              />
            </div>
            <ScInput
              data-clarity-mask="true"
              label={t('License plate (optional)')}
              placeholder={t('e.g. TN 01 AB 1234')}
              value={vehicleForm.licensePlate}
              onChange={(e) =>
                setVehicleForm({
                  ...vehicleForm,
                  licensePlate: e.target.value.toUpperCase(),
                })
              }
            />
            <div>
              <p className="mb-2 text-t5 font-medium text-text-secondary">
                {t('Type')}
              </p>
              <div className="flex gap-2">
                {VEHICLE_TYPES.map((type) => (
                  <Chip
                    key={type.value}
                    label={t(type.label)}
                    selected={vehicleForm.vehicleType === type.value}
                    onClick={() =>
                      setVehicleForm({ ...vehicleForm, vehicleType: type.value })
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
                {saving === 'vehicle' ? t('Saving...') : t('Save vehicle')}
              </ScButton>
              <ScButton
                variant="secondary"
                onClick={() => setShowVehicleForm(false)}
              >
                {t('Cancel')}
              </ScButton>
            </div>
          </div>
        ) : (
          <div className="flex">
            {/* Named "Add vehicle": "Add a car" alone is clear on screen, and
                a screen reader hears the same name as before. */}
            <HubPill onClick={() => setShowVehicleForm(true)} ariaLabel={t('Add vehicle')}>
              <IconPlus size={15} aria-hidden="true" />
              {t('Add a car')}
            </HubPill>
          </div>
        )}
      </section>

      <ProfileTiles
        bookings={{ count: figures?.count ?? null, next: figures?.next ?? null }}
        saved={{
          count: savedGarages.data?.vendors.length ?? null,
          photos: (savedGarages.data?.vendors ?? [])
            .map((v) => v.photos?.[0])
            .filter((src): src is string => !!src),
        }}
        credit={giftsOn ? { label: credit.data ? giftRupees(credit.data.balance) : null } : null}
        coupons={readyCoupons}
      />

      {/* Bring your garage (21 Nov 2026): the one red card on Profile. */}
      <BringGarageHubCard />

      {/* The smaller things, in one card: Gift a wash (while gifts are on),
          Slot alerts (while any wait, 0047) and Detlio Rewards (0050). */}
      {(giftsOn || slotAlertCount > 0 || rewardsOn) && (
        <HubList>
          {giftsOn && <HubRow href="/profile/gifts" icon={IconGift} label={t('Gift a wash')} />}
          {slotAlertCount > 0 && (
            <HubRow
              href="/profile/slot-alerts"
              icon={IconBell}
              label={t('Slot alerts')}
              value={<span className="font-numeric">{slotAlertCount}</span>}
            />
          )}
          {rewardsOn && (
            <HubRow
              href="/profile/rewards"
              icon={IconAward}
              label={t('Detlio Rewards')}
              sub={
                rewardsSummary.data && (
                  <>
                    <Figures text={stampsToGoLine(rewardsSummary.data.card.toGo)} />
                    {/* 0054: the badge count. */}
                    {rewardsSummary.data.extras &&
                      rewardsSummary.data.extras.badgesEarned > 0 && (
                        <Figures
                          text={` · ${tn(rewardsSummary.data.extras.badgesEarned, '{count} badge', '{count} badges')}`}
                        />
                      )}
                  </>
                )
              }
              value={
                rewardsSummary.data && (
                  <LevelBadge
                    level={rewardsSummary.data.level.level}
                    label={rewardsSummary.data.level.label}
                  />
                )
              }
            />
          )}
        </HubList>
      )}

      <section aria-labelledby="profile-addresses" className="flex flex-col gap-3">
        <HubSectionHead id="profile-addresses" title={t('Addresses')} />

        {addresses.length === 0 && !showAddressForm ? (
          <div className="hub-card p-5">
            <p className="text-t3 text-text-secondary">{t('No addresses added yet.')}</p>
          </div>
        ) : (
          addresses.length > 0 && (
            <div className="hub-card p-5">
              <AddressMapBand />
              <ul className="flex flex-col divide-y divide-line">
                {addresses.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1" data-clarity-mask="true">
                      <p className="text-t3 text-text-primary">{a.label}</p>
                      <p className="truncate text-t5 text-dim">
                        {a.address}
                        {a.pincode ? ` · ${a.pincode}` : ''}
                      </p>
                    </div>
                    {a.isDefault ? (
                      <span className="shrink-0 rounded-full border border-[rgba(74,222,128,.3)] px-2 py-0.5 text-t5 text-[#4ade80]">
                        {t('Default')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={t('Make {label} the default address', { label: a.label })}
                        onClick={() => makeAddressDefault(a.id)}
                        disabled={promoting === a.id}
                        className="-my-1 min-h-11 shrink-0 px-1 text-t5 text-dim transition-colors hover:text-text-primary disabled:opacity-40"
                      >
                        {promoting === a.id ? t('Setting...') : t('Set default')}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={t('Edit {label} address', { label: a.label })}
                      onClick={() => setEditingAddress(a.id)}
                      className="-my-2 flex size-11 shrink-0 items-center justify-center text-text-muted transition-colors hover:text-text-primary"
                    >
                      <IconPencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('Remove {label} address', { label: a.label })}
                      onClick={() => removeAddress(a.id)}
                      disabled={deleting === a.id}
                      className="-my-2 -mr-3 flex size-11 shrink-0 items-center justify-center text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
                    >
                      <IconTrash size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        )}

        {showAddressForm ? (
          <div className="hub-card flex flex-col gap-3 p-5">
            <ScInput
              data-clarity-mask="true"
              label={t('Label')}
              placeholder={t('e.g. Home, Work')}
              value={addressForm.label}
              onChange={(e) =>
                setAddressForm({ ...addressForm, label: e.target.value })
              }
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-t5 font-medium text-text-secondary">
                {t('Pin the exact spot (optional)')}
              </span>
              <p className="text-t5 text-text-muted">
                {t("Needed only for doorstep and pickup & drop — we'll ask before your first one if you skip it.")}
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
              data-clarity-mask="true"
              label={t('Address')}
              placeholder={t('Street, area')}
              value={addressForm.address}
              onChange={(e) =>
                setAddressForm({ ...addressForm, address: e.target.value })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <ScInput
                data-clarity-mask="true"
                label={t('City')}
                placeholder={t('e.g. Chennai')}
                value={addressForm.city}
                onChange={(e) =>
                  setAddressForm({ ...addressForm, city: e.target.value })
                }
              />
              <ScInput
                data-clarity-mask="true"
                label={t('Pincode')}
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
                {saving === 'address' ? t('Saving...') : t('Save address')}
              </ScButton>
              <ScButton
                variant="secondary"
                onClick={() => setShowAddressForm(false)}
              >
                {t('Cancel')}
              </ScButton>
            </div>
          </div>
        ) : (
          <div className="flex">
            <HubPill onClick={() => setShowAddressForm(true)} ariaLabel={t('Add address')}>
              <IconPlus size={15} aria-hidden="true" />
              {t('Add address')}
            </HubPill>
          </div>
        )}
      </section>

      <section aria-labelledby="profile-settings" className="flex flex-col gap-3">
        <HubSectionHead id="profile-settings" title={t('Settings & help')} />
        <HubList>
          {/* Browser notifications on this device, and what to send (0044). */}
          {pushOn && <HubRow href="/profile/notifications" icon={IconBell} label={t('Notifications')} />}
          {/* English or தமிழ் (Tamil), on this browser. */}
          <LanguageRow variant="row" />
          {/* The answers first: most questions do not need a call. */}
          <HubRow href="/help" icon={IconHelpCircle} label={t('Help centre')} />
        </HubList>
        <SupportCard />
      </section>

      <MyComplaints />

      {/* The five legal pages, one tap from the account they govern, and the
          cookie choice. Plain links: nothing here is an action, so nothing
          is red. */}
      <section aria-labelledby="profile-legal" className="flex flex-col gap-3">
        <HubSectionHead id="profile-legal" title={t('Legal')} />
        <HubList>
          {LEGAL_LINKS.map((link) => (
            <HubRow key={link.href} href={link.href} icon={IconFileText} label={link.label} />
          ))}
          {/* Changes the choice the cookie bar asked for. */}
          <CookieSettingsButton className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left text-t3 text-text-primary">
            <RowIcon icon={IconCookie} />
            <span className="min-w-0 flex-1">{t('Cookie settings')}</span>
            <IconChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
          </CookieSettingsButton>
        </HubList>
      </section>

      <button
        type="button"
        onClick={handleLogout}
        className="press mt-1 flex min-h-12 items-center justify-center gap-2 rounded-full border border-line bg-white/[0.03] text-t3 text-text-primary"
      >
        <IconLogout size={18} aria-hidden="true" />
        {t('Log out')}
      </button>

      {/* Apple 5.1.1(v) (0066): deleting the account in the app. Quiet, last
          on the page; the sheet says what goes, what stays and why. */}
      <button
        type="button"
        onClick={() => setDeletingAccount(true)}
        className="mx-auto mb-2 min-h-11 px-3 text-t4 text-text-muted underline underline-offset-2 transition-colors hover:text-text-primary"
      >
        {t('Delete account')}
      </button>

      {editingProfile && user && (
        <EditProfileSheet user={user} open onClose={() => setEditingProfile(false)} />
      )}
      {vehicles
        .filter((v) => v.id === editingVehicle)
        .map((v) => (
          <EditVehicleSheet
            key={v.id}
            vehicle={v}
            open
            onClose={() => setEditingVehicle(null)}
            onSaved={() => void invalidateHome(queryClient)}
          />
        ))}
      {addresses
        .filter((a) => a.id === editingAddress)
        .map((a) => (
          <EditAddressSheet key={a.id} address={a} open onClose={() => setEditingAddress(null)} />
        ))}
      <DeleteAccountSheet
        open={deletingAccount}
        onClose={() => setDeletingAccount(false)}
        onDeleted={finishDeletion}
      />
    </CustomerShell>
  )
}
