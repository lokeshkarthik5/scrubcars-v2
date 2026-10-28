'use client'

import { use, useCallback, useEffect, useRef, useState, Suspense } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  IconAlertCircle,
  IconArrowUpRight,
  IconCheck,
  IconChevronRight,
  IconCircleCheckFilled,
  IconLoader2,
  IconLock,
  IconMapPin,
  IconPercentage,
  IconPlus,
  IconRefresh,
  IconShieldCheck,
  IconStarFilled,
  IconX,
} from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { useQueryClient } from '@tanstack/react-query'
import { MainAction } from '@/components/main-action'
import { isHomeHubEnabled } from '@/lib/home-hub'
import { LEGAL_PATHS } from '@/lib/legal/routes'
import { currentMarketingContext, trackPurchase } from '@/lib/meta-pixel'
import {
  PaymentReceivedPanel,
  paymentReceivedText,
} from '@/components/payment-received-panel'
import {
  LocationPicker,
  type PickedLocation,
} from '@repo/ui/features/location-picker'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { ScSheet } from '@repo/ui/sc/modal'
import { Notice } from '@repo/ui/sc/notice'
import { OutsideCityLine } from '@repo/ui/features/outside-city'
import { useGuaranteeConfig } from '@repo/core/api/hooks/use-guarantee'
import { GUARANTEE_BADGE, GUARANTEE_SUMMARY } from '@repo/core/guarantee'
import { WhenPicker } from '@/components/checkout/when-picker'
import { PageHeader } from '@/components/ui/page-header'
import { formatClock } from '@repo/core/format'
import { money } from '@/lib/money'
import { servicePriceText } from '@/lib/price'
import { bookingCarId } from '@/lib/booking-car'
import { guaranteeCovers } from '@/lib/guarantee-cover'
import { SlotAlertAsk } from '@/components/slot-alerts/slot-alert-ask'
import { slotKeys } from '@repo/core/api/hooks/use-slots'
import { ScSwitch } from '@repo/ui/sc/switch'
import { ScToggle } from '@repo/ui/sc/toggle'
import type { AppliedDiscount } from '@repo/core/api/discounts'
import {
  errorMessage,
  useValidateDiscount,
} from '@repo/core/api/hooks/use-discounts'
import {
  createBookingIntent,
  getBookingIntentStatus,
  verifyPayment,
} from '@repo/core/api/payments'
import {
  confirmPayment,
  intentPollResult,
  realClock,
} from '@repo/core/payment-confirmation'
import { getAddresses, updateAddress } from '@repo/core/api/users'
import { ApiError } from '@repo/core/api/client'
import { amountBucket } from '@repo/core/analytics-events'
import { track } from '@repo/core/analytics'
import { garageQuery } from '@repo/core/api/hooks/use-vendors'
import { pickRequestedServices, unofferedMode } from '@repo/core/book-again'
import { getVendor } from '@repo/core/api/vendors'
import { outsideCityCheckoutLine } from '@repo/core/service-city'
import {
  openRazorpayCheckout,
  RazorpayReportedError,
} from '@repo/core/razorpay'
import { useUserStore } from '@repo/core/stores/user-store'
import { useAuthStore } from '@repo/core/stores/auth-store'
import {
  isLastingRefusal,
  livePendingCheckout,
  pendingCodeFor,
  usePendingCheckoutStore,
} from '@repo/core/stores/pending-checkout-store'
import { invalidateHome } from '@repo/core/api/hooks/use-home'
import {
  invalidateRewards,
  rewardsEnabled,
  useRewardsConfig,
  useRewardsSummary,
} from '@repo/core/api/hooks/use-rewards'
import {
  invalidateCoupons,
  useMyCoupons,
} from '@repo/core/api/hooks/use-coupons'
import { couponsForCheckout } from '@/lib/coupons'
import { rewardRupees } from '@repo/core/rewards'
import {
  giftsEnabled,
  invalidateGiftData,
  useGiftsConfig,
  useMyCredit,
} from '@repo/core/api/hooks/use-gifts'
import { checkoutCreditSplit } from '@/lib/gifts'
import { useNow } from '@repo/core/hooks/use-now'
import {
  BOOKING_TYPE_LABELS,
  bookingTypeParam,
  offeredBookingTypes,
  parseBookingType,
  resolveBookingType,
  noticeSentence,
} from '@repo/core/booking-types'
import {
  PICKUP_RESPONSIBILITY_LINE,
  insidePickupReach,
  pickupFeeLabel,
} from '@repo/core/pickup'
import type { BookingType, Service, Vendor } from '@repo/core/types'
import { resolveServiceAmount } from '@repo/core/pricing'
import { Figures } from '@repo/ui/sc/figures'
import { VEHICLE_TIERS } from '@repo/core/vehicles'
import { cn, formatDuration, formatServiceSummary } from '@repo/core/utils'

// Sheets closed on arrival are loaded after the page, not with it: they are
// out of the first load's JavaScript, and on the page well before anyone can
// tap what opens them. Client-only, since closed they render nothing anyway.
const AddCarSheet = dynamic(
  () => import('@repo/ui/features/add-car-sheet').then((m) => m.AddCarSheet),
  { ssr: false }
)
const AddAddressSheet = dynamic(
  () => import('@/components/add-address-sheet').then((m) => m.AddAddressSheet),
  { ssr: false }
)

/**
 * What checkout can still be waiting on, in the order the page asks for it.
 * `address` and `pin` are for doorstep and pickup & drop; `outside` is a
 * pickup address the garage does not collect from; `unpriced` is a service
 * the garage has not priced for the chosen car, which only shows once a car
 * is picked.
 */
type CheckoutStep = 'slot' | 'car' | 'address' | 'pin' | 'outside' | 'unpriced'

/** "a doorstep visit", as the mode-withdrawn notice ends its sentence. */
const BOOKED_AS: Record<BookingType, string> = {
  dropin: 'at the garage',
  doorstep: 'a doorstep visit',
  pickup: 'pickup & drop',
}

function BookContent({ vendorId }: { vendorId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Comma-separated, in the order they were added on the garage page.
  const serviceIdsParam = searchParams.get('service')
  // At garage, Doorstep or Pickup & drop, as chosen on home or the garage
  // page. Absent means no choice was made, which checkout takes as At garage.
  const modeParam = searchParams.get('mode')
  // The saved address to open on, from Book again on a doorstep or pickup &
  // drop booking. Used only if it is still one of the customer's addresses.
  const addressParam = searchParams.get('address')
  // An offer code from Home: a garage's own offer rides in the link
  // (/garage/:id?code= passes it on); a Detlio-wide one, and the car picked
  // on Home, come from the pending-checkout store.
  const codeParam = searchParams.get('code')?.trim().toUpperCase() || null
  // The day to open the picker on: a slot alert's notification (0047) links
  // here with the day a time opened.
  const dateParam = searchParams.get('date')
  const vehicles = useUserStore((s) => s.vehicles)
  const addresses = useUserStore((s) => s.addresses)
  const profile = useUserStore((s) => s.profile)
  const fetchVehicles = useUserStore((s) => s.fetchVehicles)
  const fetchAddresses = useUserStore((s) => s.fetchAddresses)
  const fetchProfile = useUserStore((s) => s.fetchProfile)

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [selectedServices, setSelectedServices] = useState<Service[]>([])
  // Each of the garage's services' category, by id: a package's members are
  // looked up here to tell whether the Guarantee covers it.
  const [categoryById, setCategoryById] = useState<Record<string, string>>({})
  // Detlio Guarantee (0051): the checkout badge shows only while it is on.
  const guaranteeOn = useGuaranteeConfig().data?.enabled === true
  // Set when the link asked for services the garage no longer sells (Book
  // again on an old booking, a tab left open), so the page can say why the
  // cart is shorter than what was asked for.
  const [servicesDropped, setServicesDropped] = useState(false)
  // Why the garage's services could not be loaded: it is not listed any more
  // (the API's 404), or the request failed. Either beats a checkout that sits
  // empty with nothing to book.
  const [loadProblem, setLoadProblem] = useState<'gone' | 'failed' | null>(null)
  // Bumped by Retry to load the garage again.
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const [pickedVehicle, setPickedVehicle] = useState<string | null>(null)
  const [pickedAddress, setPickedAddress] = useState<string | null>(null)
  // Set while an address saved without a pin is being given one, inline.
  const [pinningAddress, setPinningAddress] = useState(false)
  // Addresses the server said this garage does not collect from
  // (OUTSIDE_PICKUP_RADIUS), whatever the early check below thought.
  const [refusedAddressIds, setRefusedAddressIds] = useState<string[]>([])
  const [chosenType, setChosenType] = useState<BookingType | null>(() =>
    parseBookingType(modeParam)
  )
  const [loading, setLoading] = useState(false)
  const bookingLockRef = useRef(false)
  // Set the moment Razorpay reports the money taken, and never cleared: from
  // then on this screen confirms that payment and cannot start another. The
  // ref is what the Pay handler checks, so no render timing can let a second
  // tap through; the state is what the footer draws.
  const paidRef = useRef(false)
  const [paid, setPaid] = useState<{
    paymentId: string
    /** confirming → (booked, and gone) | unconfirmed | failed */
    phase: 'confirming' | 'unconfirmed' | 'failed'
    refundMessage?: string
  } | null>(null)

  // Where the bottom button takes the customer when a step is still missing.
  // Headings rather than whole sections, so focus lands on something with a
  // name; the slot picker owns its headings, so its wrapper stands in.
  const slotStepRef = useRef<HTMLElement>(null)
  const carStepRef = useRef<HTMLHeadingElement>(null)
  const addressStepRef = useRef<HTMLHeadingElement>(null)
  const pinStepRef = useRef<HTMLParagraphElement>(null)
  const summaryStepRef = useRef<HTMLHeadingElement>(null)

  // What is typed vs what is actually applied. Kept apart so a keystroke never
  // re-queries — only pressing Apply does.
  const [promoInput, setPromoInput] = useState('')
  // The coupon field starts closed — a row to tap, not a form to ignore.
  const [promoOpen, setPromoOpen] = useState(false)
  const [addCarOpen, setAddCarOpen] = useState(false)
  const [addAddressOpen, setAddAddressOpen] = useState(false)
  // Stored with the exact cart and vehicle it was validated against. Those
  // decide the subtotal, so a code checked against one basket says nothing
  // about another — removing a service can drop the total below the code's
  // minimum. See `appliedDiscount` below.
  const [appliedPromo, setAppliedPromo] = useState<{
    discount: AppliedDiscount
    serviceKey: string
    vehicleId: string
  } | null>(null)
  // The request lifecycle (pending, error) is the mutation's; `appliedPromo`
  // above is ours, because "which code did the customer commit to" is client
  // state, not a server response.
  const applyPromo = useValidateDiscount()
  // Detlio credit (0049): on by default whenever there is some to use. The
  // row only exists while gifts are on and the balance is above zero.
  const [creditSwitchOn, setCreditSwitchOn] = useState(true)

  // What Home handed over (@repo/core/stores/pending-checkout-store): only
  // this account's, only while the offer still runs, and only a code that can
  // work at this garage. Read, never trusted: the code is validated like a
  // typed one.
  const userId = useAuthStore((s) => s.user?.id)
  const giftsConfig = useGiftsConfig()
  const giftsOn = giftsEnabled(giftsConfig.data)
  const myCredit = useMyCredit(giftsOn && !!userId)
  // Detlio Rewards (0050): the customer's vouchers, offered as one tap under
  // the coupon row. A voucher is a promo code that only they can use; it goes
  // through the same check and booking write as any code.
  const rewardsConfig = useRewardsConfig()
  const rewardsSummary = useRewardsSummary(
    rewardsEnabled(rewardsConfig.data) && !!userId
  )
  const rewardVouchers = (rewardsSummary.data?.vouchers ?? []).filter(
    (v) => v.code
  )
  // Printed coupons (0056): the customer's ready coupon vouchers, offered
  // the same way, whether or not Rewards is on.
  const myCoupons = couponsForCheckout(useMyCoupons(!!userId).data)
  const pending = usePendingCheckoutStore((s) => s.pending)
  const forgetPendingCode = usePendingCheckoutStore((s) => s.forgetCode)
  const clearPending = usePendingCheckoutStore((s) => s.clear)
  const now = useNow()
  const livePending = livePendingCheckout(pending, { userId, now })
  // Set by Remove, or by the customer applying a code of their own: from then
  // on Home's code stays out of this checkout.
  const [offerDropped, setOfferDropped] = useState(false)
  // A code from the store that the server refused for good (expired, used
  // up): forgotten there, so the next garage's checkout does not bring it
  // back, but still named here until the customer removes it, so the reason
  // stays on the page rather than vanishing with the store's copy.
  const [refusedOffer, setRefusedOffer] = useState<string | null>(null)
  const offerCode = offerDropped
    ? null
    : (codeParam ?? pendingCodeFor(livePending, vendorId) ?? refusedOffer)
  // The cart, car and code Home's code was last checked against, so it is
  // checked once per change and never twice for the same one.
  const offerCheckedFor = useRef<string | null>(null)

  useEffect(() => {
    // A run overtaken by the next one (the link changed, Retry, or Strict
    // Mode's second pass in development) must not write its answer over the
    // newer one, nor redirect the customer a second time.
    let cancelled = false
    // The garage page's own query (the garage, its services and its
    // packages, fetched together): from the cache when Book Now was tapped on
    // it under a minute ago, so checkout opens at once on the catalogue the
    // customer picked from, and fetched otherwise. Packages come with the
    // plain services because a package is a bookable line like any other,
    // and `/services` deliberately excludes them. Without them, a customer
    // who added a package on the garage page arrived here with nothing
    // selected.
    queryClient.fetchQuery(garageQuery(vendorId)).then(
      (garage) => {
        if (cancelled) return
        // Not listed (a 404 on any of the three): the garage page's answer.
        if (garage === null) {
          setVendor(null)
          setLoadProblem('gone')
          return
        }
        setVendor(garage.vendor)
        setCategoryById(
          Object.fromEntries(
            garage.services.map((service) => [service.id, service.category])
          )
        )
        const svcs = garage.services
        const catalogue: Service[] = [...garage.services, ...garage.packages]

        // Resolved in the order the ids arrived, not the order the catalogue
        // came back in: that order is the customer's, and it is what the
        // summary and the booking's line items preserve. Only services the
        // garage still sells: a withdrawn one is not in the catalogue.
        const { requested, picked } = pickRequestedServices(
          serviceIdsParam,
          catalogue
        )

        // Everything asked for has been withdrawn. Standing another service
        // in for it would book something the customer never chose, so they
        // pick again from what the garage sells now. The garage page says why
        // (`withdrawn`), on the page rather than in a toast that could close
        // before the page it is about has even loaded.
        if (requested.length > 0 && picked.length === 0) {
          const next = new URLSearchParams({ withdrawn: '1' })
          const mode = parseBookingType(modeParam)
          const modeQuery = mode ? bookingTypeParam(mode) : null
          if (modeQuery) next.set('mode', modeQuery)
          router.replace(`/garage/${vendorId}?${next.toString()}`)
          return
        }

        setServicesDropped(picked.length < requested.length)
        // Landing here with no service at all (a shared link) still has to
        // book something, so the first service stands in — as it did when
        // this screen only ever handled one.
        setSelectedServices(picked.length > 0 ? picked : svcs.slice(0, 1))
      },
      (error: unknown) => {
        if (cancelled) return
        setLoadProblem(
          error instanceof ApiError && error.status === 404 ? 'gone' : 'failed'
        )
      }
    )
    void fetchVehicles()
    void fetchAddresses().catch(() => undefined)
    void fetchProfile()
    return () => {
      cancelled = true
    }
  }, [
    vendorId,
    serviceIdsParam,
    modeParam,
    router,
    loadAttempt,
    queryClient,
    fetchVehicles,
    fetchAddresses,
    fetchProfile,
  ])

  // The car is picked for the customer (F1): the one they had on screen on
  // Home when they tapped Book a wash or an offer (if it is still saved),
  // else their default car, else their only car. A tap on another car
  // changes it.
  //
  // Derived rather than written back by an effect, for the same reason
  // `appliedDiscount` below is: there is no render where the selection is
  // still empty, and nothing has to re-fire when the car list arrives.
  // The shared rule (lib/booking-car.ts), the same one the garage page
  // priced with, so the price quoted there is the price charged here.
  const selectedVehicle =
    pickedVehicle ?? bookingCarId(vehicles, livePending?.vehicleId)

  // Derived rather than set when the garage loads, for the same reason the car
  // is: the choice carried in from the garage page stands unless this garage
  // cannot do it, and there is no render where the toggle shows the wrong one.
  const bookingType = resolveBookingType(chosenType, vendor)
  // The mode asked for, when this garage no longer offers it: Book again on
  // a doorstep job at a garage that has since stopped travelling, or one that
  // stopped collecting while the customer was here (PICKUP_NOT_OFFERED).
  // Checkout books the mode the garage does offer, and says so up top.
  const modeWithdrawn = unofferedMode(chosenType, vendor)
  // The switch, when the garage offers more than one mode.
  const modeOptions = vendor
    ? offeredBookingTypes(vendor).map((value) => ({
        value,
        label: BOOKING_TYPE_LABELS[value],
      }))
    : []

  // Checkout opened with something in the cart: once per visit to this page.
  const checkoutSeen = useRef(false)
  const serviceCount = selectedServices.length
  useEffect(() => {
    if (checkoutSeen.current || !vendor || serviceCount === 0) return
    checkoutSeen.current = true
    track('checkout_start', { vendorId, mode: bookingType, serviceCount })
  }, [vendor, vendorId, bookingType, serviceCount])

  // A time picked (not the picker letting one go). Stable, since the picker
  // lists it among its effect's dependencies.
  const pickSlot = useCallback(
    (scheduledAt: string | null) => {
      setSelectedSlot(scheduledAt)
      if (scheduledAt) track('slot_select', { vendorId, mode: bookingType })
    },
    [vendorId, bookingType]
  )
  const pickAddress = (addressId: string) => {
    setPickedAddress(addressId)
    track('address_select', { vendorId, mode: bookingType })
  }

  // Doorstep and pickup & drop. Unlike the car, the default *is* preselected:
  // the customer chose it as "where I am" in their profile, so re-asking adds
  // a step without adding a decision. Book again's address comes first, then
  // the default, then the only address when there is one.
  const isPickup = bookingType === 'pickup'
  const usesAddress = bookingType === 'doorstep' || isPickup
  const linkedAddress = addresses.some((a) => a.id === addressParam)
    ? addressParam
    : null
  const selectedAddress = usesAddress
    ? (pickedAddress ??
      linkedAddress ??
      addresses.find((a) => a.isDefault)?.id ??
      (addresses.length === 1 ? addresses[0].id : null))
    : null
  const selectedAddressRecord =
    addresses.find((a) => a.id === selectedAddress) ?? null
  // The server refuses a doorstep booking against an address with no
  // coordinates (ADDRESS_LOCATION_REQUIRED) — it cannot check the garage's
  // travel radius without them — so the pin is asked for here rather than
  // letting checkout fail.
  //
  // 0,0 counts as no pin. Profile setup used to save it whenever location was
  // refused, and the server takes it as a real point in the Gulf of Guinea, so
  // those addresses failed the radius check at payment instead of being asked
  // for a pin here. Setup no longer writes it; this catches the ones it did.
  const addressNeedsPin =
    selectedAddressRecord != null &&
    (selectedAddressRecord.lat == null ||
      selectedAddressRecord.lng == null ||
      (selectedAddressRecord.lat === 0 && selectedAddressRecord.lng === 0))
  // Pickup & drop: whether the garage collects from an address. The early
  // check is straight-line km against the garage's pickup radius, so the
  // customer hears it at the address step rather than after Pay; the server
  // (OUTSIDE_PICKUP_RADIUS) has the last word, and an address it refused
  // stays refused here.
  const outsidePickup = (address: (typeof addresses)[number]) =>
    isPickup &&
    vendor != null &&
    (refusedAddressIds.includes(address.id) ||
      // 0,0 is no pin (see addressNeedsPin), not a point in the sea.
      (!(address.lat === 0 && address.lng === 0) &&
        insidePickupReach(vendor, address) === false))
  const addressOutside =
    selectedAddressRecord != null &&
    !addressNeedsPin &&
    outsidePickup(selectedAddressRecord)
  // The way forward when this garage cannot collect: another mode it offers.
  const otherMode = vendor
    ? (offeredBookingTypes(vendor).find((type) => type !== 'pickup') ?? null)
    : null
  const outsideAdvice = `This garage doesn't pick up from this address. Try another address${
    otherMode ? ` or choose ${BOOKING_TYPE_LABELS[otherMode]}` : ''
  }.`
  /**
   * Why a doorstep or pickup & drop booking cannot be paid for yet, if it
   * cannot.
   *
   * Named rather than a boolean because the CTA has to say which it is — the
   * bottom bar is always on screen, so an unexplained dead button is the one
   * outcome worse than no button at all. Same shape as `unpricedForVehicle`
   * below, which already disables and explains.
   */
  const addressBlocker: 'address' | 'pin' | 'outside' | null = !usesAddress
    ? null
    : selectedAddress == null
      ? 'address'
      : addressNeedsPin
        ? 'pin'
        : addressOutside
          ? 'outside'
          : null
  const addressReady = addressBlocker === null

  // Identifies the exact cart a code was validated against. Removing a service
  // changes it, which retires the code — the total it was checked against no
  // longer exists.
  const serviceIds = selectedServices.map((service) => service.id)
  const serviceKey = serviceIds.join(',')

  // Derived rather than cleared in an effect: if the customer changes the
  // services or the car, the applied code is simply not the applied code any
  // more. There is no render in between where a stale discount could be shown
  // or submitted.
  const appliedDiscount =
    appliedPromo &&
    appliedPromo.serviceKey === serviceKey &&
    appliedPromo.vehicleId === selectedVehicle
      ? appliedPromo.discount
      : null
  // A reward voucher applied shows by its name, not its code.
  const appliedReward = appliedDiscount
    ? rewardVouchers.find(
        (v) => v.code?.toUpperCase() === appliedDiscount.code.toUpperCase()
      )
    : undefined
  const appliedCoupon = appliedDiscount
    ? myCoupons.find(
        (c) => c.code.toUpperCase() === appliedDiscount.code.toUpperCase()
      )
    : undefined

  const selectedVehicleType = vehicles.find(
    (v) => v.id === selectedVehicle
  )?.vehicleType
  // The tier drives the price for per-vehicle services, so the summary names
  // it — using the same labels the vendor priced against ("SUV / MUV", not "suv").
  const vehicleTierLabel = VEHICLE_TIERS.find(
    (tier) => tier.value === selectedVehicleType
  )?.label

  // One priced line per service, in the customer's order. `amount` is null for
  // a per-vehicle service the garage has not priced for this car — the server
  // refuses such a booking rather than billing another tier's rate, so the
  // line is shown but the payment is blocked below.
  const lines = selectedServices.map((service) => ({
    service,
    amount: resolveServiceAmount(service, selectedVehicleType),
  }))

  const unpricedLines =
    selectedVehicleType != null
      ? lines.filter((line) => line.amount == null)
      : []
  const unpricedForVehicle = unpricedLines.length > 0

  /**
   * The first thing still missing before the customer can pay, or null when
   * nothing is.
   *
   * The bottom bar is on screen the whole time, so it names this step and
   * tapping it scrolls there. It used to read "Pay Now" from the first second,
   * disabled and faded, with nothing to say what it was waiting for.
   */
  const nextStep: CheckoutStep | null = !selectedSlot
    ? 'slot'
    : !selectedVehicle
      ? 'car'
      : (addressBlocker ?? (unpricedForVehicle ? 'unpriced' : null))

  const stepLabels: Record<CheckoutStep, string> = {
    slot: 'Pick a time',
    // "Choose" only when there is something to choose between; the step
    // itself says "Add a car" when the customer has none.
    car: vehicles.length === 0 ? 'Add your car' : 'Choose your car',
    address: addresses.length === 0 ? 'Add your address' : 'Choose an address',
    pin: 'Pin your address on the map',
    outside: 'Choose another address',
    unpriced: 'Remove the unpriced service',
  }

  // Scrolls to the step and puts focus on it, so a keyboard or screen-reader
  // user arrives there too. `preventScroll` keeps the focus call from cutting
  // the smooth scroll short with a jump; the step's scroll-margin keeps its
  // heading clear of the sticky top bar.
  const goToStep = (step: CheckoutStep) => {
    const target = {
      slot: slotStepRef,
      car: carStepRef,
      address: addressStepRef,
      pin: pinStepRef,
      outside: addressStepRef,
      unpriced: summaryStepRef,
    }[step].current
    if (!target) return

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    target.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    })
    target.focus({ preventScroll: true })
  }

  // The picker let go of the chosen time (it ran out of notice, or the
  // customer switched to doorstep, which needs more): say so and go back to it.
  const handleSlotLapse = (scheduledAt: string) => {
    const label = formatClock(scheduledAt)
    toast.info(
      `${label} is now too soon to book. ${noticeSentence(bookingType)} Pick another time.`
    )
    goToStep('slot')
  }

  // The pre-discount total. Summed in paise so the arithmetic never runs
  // through a float — the same rule the server applies.
  const subtotal = unpricedForVehicle
    ? null
    : lines.reduce(
        (total, line) => total + Math.round((line.amount ?? 0) * 100),
        0
      ) / 100

  // What the customer will actually be charged. The server recomputes this at
  // booking time; this is only what the button says.
  const payableAmount = appliedDiscount
    ? Number(appliedDiscount.finalAmount)
    : subtotal

  // Detlio credit comes off after any promo code. The server decides how
  // much (creditToUse, mirrored by checkoutCreditSplit): all of it when the
  // balance covers the booking, and otherwise never leaving Razorpay under
  // ₹1. This is only what the summary and the button say.
  const creditBalance = giftsOn ? Number(myCredit.data?.balance ?? 0) : 0
  const creditSplit =
    creditBalance > 0 && payableAmount != null && payableAmount > 0
      ? checkoutCreditSplit(payableAmount, creditBalance)
      : null
  const creditOffered = creditSplit !== null && creditSplit.credit > 0
  const creditApplied = creditOffered && creditSwitchOn
  const toPay = creditApplied ? creditSplit.toPay : payableAmount

  const totalDuration = selectedServices.reduce(
    (total, service) => total + service.durationMins,
    0
  )

  const canApplyPromo =
    promoInput.trim().length >= 3 &&
    selectedServices.length > 0 &&
    selectedVehicle != null &&
    !unpricedForVehicle

  /** One tap on a reward voucher: applied exactly like a typed code. */
  const handleApplyReward = (code: string) => {
    if (
      selectedServices.length === 0 ||
      selectedVehicle == null ||
      unpricedForVehicle ||
      applyPromo.isPending
    )
      return
    const vehicleId = selectedVehicle
    applyPromo.mutate(
      { code, vendorId, serviceIds, vehicleId },
      {
        onSuccess: (applied) => {
          setAppliedPromo({ discount: applied, serviceKey, vehicleId })
          if (offerCode && applied.code !== offerCode) setOfferDropped(true)
        },
        onError: (error) => {
          setAppliedPromo(null)
          toast.error(
            error instanceof Error
              ? error.message
              : "This can't be used on this booking."
          )
        },
      }
    )
  }

  const handleApplyPromo = () => {
    if (!canApplyPromo || applyPromo.isPending) return

    const vehicleId = selectedVehicle!

    applyPromo.mutate(
      { code: promoInput.trim(), vendorId, serviceIds, vehicleId },
      {
        onSuccess: (applied) => {
          setAppliedPromo({ discount: applied, serviceKey, vehicleId })
          setPromoOpen(false)
          // The customer's own code replaces the one Home brought.
          if (offerCode && applied.code !== offerCode) setOfferDropped(true)
        },
        onError: () => setAppliedPromo(null),
      }
    )
  }

  // Home's offer code applies itself once there is a cart and a car to price
  // it against, and is checked again whenever either changes, until the
  // customer taps Remove. A code checked against one basket says nothing
  // about another (a minimum order, a garage's own code), so it is never
  // carried over unchecked; and when the server refuses it, the coupon row
  // says why (`offerProblem` below) rather than the saving quietly vanishing.
  const offerCheckKey =
    offerCode &&
    selectedServices.length > 0 &&
    selectedVehicle &&
    !unpricedForVehicle
      ? `${offerCode}|${serviceKey}|${selectedVehicle}`
      : null
  useEffect(() => {
    if (!offerCode || !offerCheckKey || !selectedVehicle) return
    if (offerCheckedFor.current === offerCheckKey) return
    offerCheckedFor.current = offerCheckKey
    const vehicleId = selectedVehicle
    const key = serviceIds.join(',')
    const code = offerCode
    applyPromo.mutate(
      { code, vendorId, serviceIds, vehicleId },
      {
        onSuccess: (applied) =>
          setAppliedPromo({ discount: applied, serviceKey: key, vehicleId }),
        onError: (error) => {
          setAppliedPromo(null)
          if (error instanceof ApiError && isLastingRefusal(error.code)) {
            setRefusedOffer(code)
            forgetPendingCode()
          }
        },
      }
    )
    // `serviceIds` and `applyPromo` change identity every render; the key
    // already says everything that matters about them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerCheckKey, offerCode, selectedVehicle, vendorId])

  // "Best for you" (F1): the customer's biggest reward voucher, applied for
  // them once there is a cart and a car to price it against, and checked
  // again when either changes. Never over a code from Home or one they
  // applied themselves, and never again once they remove it. A refusal is
  // silent: it was a suggestion, not something they asked for.
  const bestVoucher = rewardVouchers.reduce<
    (typeof rewardVouchers)[number] | null
  >(
    (best, voucher) =>
      !best || Number(voucher.amount) > Number(best.amount) ? voucher : best,
    null
  )
  const [suggestionDropped, setSuggestionDropped] = useState(false)
  const [suggestedCode, setSuggestedCode] = useState<string | null>(null)
  const suggestionCheckedFor = useRef<string | null>(null)
  const suggestionKey =
    bestVoucher?.code &&
    !offerCode &&
    !suggestionDropped &&
    !appliedDiscount &&
    selectedServices.length > 0 &&
    selectedVehicle &&
    !unpricedForVehicle
      ? `${bestVoucher.code}|${serviceKey}|${selectedVehicle}`
      : null
  useEffect(() => {
    if (
      !suggestionKey ||
      !bestVoucher?.code ||
      !selectedVehicle ||
      applyPromo.isPending
    )
      return
    if (suggestionCheckedFor.current === suggestionKey) return
    suggestionCheckedFor.current = suggestionKey
    const vehicleId = selectedVehicle
    const key = serviceIds.join(',')
    const code = bestVoucher.code
    applyPromo.mutate(
      { code, vendorId, serviceIds, vehicleId },
      {
        onSuccess: (applied) => {
          setAppliedPromo({ discount: applied, serviceKey: key, vehicleId })
          setSuggestedCode(applied.code)
        },
        // A suggestion the server refused is not the customer's error: the
        // Coupons sheet must not show it for a code they never typed.
        onError: () => applyPromo.reset(),
      }
    )
    // As with Home's code above: the key says everything that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestionKey, applyPromo.isPending])

  // Removing a line from the summary rather than going back a screen. The last
  // one cannot be removed: an empty booking is not a state this page has.
  const removeService = (serviceId: string) => {
    setSelectedServices((current) =>
      current.length <= 1
        ? current
        : current.filter((service) => service.id !== serviceId)
    )
  }

  const handleRemovePromo = () => {
    // A suggested reward goes for this checkout: Remove means "not this".
    setSuggestionDropped(true)
    setSuggestedCode(null)
    // A code from Home goes for good: not re-applied on the next change here,
    // nor at the next garage.
    if (offerCode) {
      setOfferDropped(true)
      forgetPendingCode()
      // And off the link, so a reload or a shared link does not bring it back.
      if (codeParam) {
        const next = new URLSearchParams(searchParams.toString())
        next.delete('code')
        router.replace(`/book/${vendorId}?${next.toString()}`, {
          scroll: false,
        })
      }
    }
    setAppliedPromo(null)
    setPromoInput('')
    applyPromo.reset()
    // Back to the resting row rather than an empty open form; trying another
    // code is one tap away.
    setPromoOpen(false)
  }

  // Derived the same way `appliedDiscount` is, and for the same reason: the
  // failure belongs to the service/vehicle it was submitted against, so
  // changing either retires the message without an imperative reset. The
  // server's wording is the customer-facing reason — "This code has expired",
  // "needs a booking of ₹500 or more" — so it is shown verbatim.
  const promoError =
    applyPromo.error &&
    applyPromo.variables?.serviceIds.join(',') === serviceKey &&
    applyPromo.variables?.vehicleId === selectedVehicle
      ? errorMessage(applyPromo.error, "This code isn't valid.")
      : ''

  // Home's code, refused for this cart and car: said on the coupon row itself,
  // with the server's own reason, since the customer never typed it and the
  // sheet that shows typed codes' errors is closed.
  const offerChecking =
    !!offerCode &&
    applyPromo.isPending &&
    applyPromo.variables?.code === offerCode
  const offerProblem =
    offerCode &&
    !appliedDiscount &&
    !offerChecking &&
    applyPromo.variables?.code === offerCode
      ? promoError
      : ''

  // An address saved without a pin is normal — only doorstep and pickup &
  // drop need one. Rather
  // than sending the customer to their profile (which would lose the slot and
  // any applied code), the pin is dropped here and saved onto the address.
  const handlePinAddress = async (picked: PickedLocation) => {
    if (!selectedAddress) return
    setPinningAddress(true)
    try {
      const saved = await updateAddress(selectedAddress, {
        lat: picked.lat,
        lng: picked.lng,
        geoSource: picked.source,
      })
      useUserStore.setState((state) => ({
        addresses: state.addresses.map((a) => (a.id === saved.id ? saved : a)),
      }))
      toast.success('Location saved')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not save that location'
      )
    } finally {
      setPinningAddress(false)
    }
  }

  const handleConfirm = async () => {
    if (paidRef.current || bookingLockRef.current || loading) return
    // A code still being checked would otherwise be left off a fast Pay.
    if (applyPromo.isPending) return
    if (selectedServices.length === 0 || !selectedSlot || !selectedVehicle)
      return
    if (!addressReady) return
    bookingLockRef.current = true
    setLoading(true)
    // The price as a band, never the amount.
    track('pay_click', {
      vendorId,
      mode: bookingType,
      serviceCount: selectedServices.length,
      amountBucket:
        payableAmount === null ? undefined : amountBucket(payableAmount),
    })
    try {
      // Nothing is booked yet. The intent is priced and validated server-side,
      // but it holds no slot, no promo code and no claim on the car — so a
      // customer who closes the sheet below leaves the garage none the wiser.
      // verifyPayment is what turns it into a booking.
      const order = await createBookingIntent({
        vendorId,
        serviceIds,
        scheduledAt: selectedSlot,
        bookingType,
        vehicleId: selectedVehicle,
        paymentMethod: 'online',
        // Only ever sent for doorstep and pickup & drop; drop-in has nowhere
        // to travel to.
        addressId: selectedAddress ?? undefined,
        discountCode: appliedDiscount?.code,
        // Only said while gifts are on; the server ignores it otherwise.
        useCredit: giftsOn ? creditApplied : undefined,
      })

      // Detlio credit covered all of it (0049): there is no payment sheet,
      // and the booking already exists. Same way out as a paid checkout.
      if (order.paidWithCredit && order.bookingId) {
        paidRef.current = true
        track('pay_success', {
          vendorId,
          mode: bookingType,
          serviceCount: selectedServices.length,
        })
        void invalidateHome(queryClient)
        void invalidateGiftData(queryClient)
        void invalidateRewards(queryClient)
        void invalidateCoupons(queryClient)
        clearPending()
        router.push(`/bookings/${order.bookingId}?celebrate=1`)
        return
      }
      if (!order.orderId) {
        throw new Error('Could not start the payment. Please try again.')
      }

      await openRazorpayCheckout({
        // The order Razorpay takes: the price after any promo and credit.
        order: {
          orderId: order.orderId,
          amount: order.amount,
          currency: order.currency,
          keyId: order.keyId ?? '',
        },
        description: `${formatServiceSummary(
          selectedServices.map((service) => service.name)
        )} at ${vendor?.name ?? 'the garage'}`,
        customer: {
          name: profile?.name,
          phone: profile?.phone,
        },
        onSuccess: async (response) => {
          const paymentId = response.razorpay_payment_id
          paidRef.current = true
          setPaid({ paymentId, phase: 'confirming' })

          // Retries a dropped confirm, then watches for the booking the
          // webhook writes on its own. Never throws, and never ends in Pay.
          const outcome = await confirmPayment({
            verify: () => {
              // Only with marketing consent: the API then reports the paid
              // booking to Meta itself (Conversions API). Left out otherwise.
              const marketing = currentMarketingContext()
              return verifyPayment({
                intentId: order.intentId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: paymentId,
                razorpaySignature: response.razorpay_signature,
                ...(marketing ? { marketing } : {}),
              })
            },
            poll: async () =>
              intentPollResult(await getBookingIntentStatus(order.intentId)),
            ...realClock,
          })

          // Home's bill, tiles and bell all move with a new booking, and
          // the credit with a booking that used some.
          void invalidateHome(queryClient)
          if (creditApplied) void invalidateGiftData(queryClient)
          // A reward voucher used on it leaves Your rewards (0050), a coupon Your coupons (0056).
          void invalidateRewards(queryClient)
          void invalidateCoupons(queryClient)
          if (outcome.kind === 'booked') {
            // Statistics → Behaviour's "paid".
            track('pay_success', {
              vendorId,
              mode: bookingType,
              serviceCount: selectedServices.length,
              amountBucket: amountBucket(order.amount / 100),
            })
            // Meta's Purchase (marketing consent only): what Razorpay took,
            // in rupees, under the event id the API's report shares.
            void trackPurchase({
              bookingId: outcome.bookingId,
              rupeesPaid: order.amount / 100,
              numItems: selectedServices.length,
            })
            // The offer and car Home handed over have done their job.
            clearPending()
            // ?celebrate=1 triggers the success burst on arrival; the booking
            // page strips it once played.
            router.push(`/bookings/${outcome.bookingId}?celebrate=1`)
          } else if (outcome.kind === 'failed') {
            track('pay_failed', { vendorId, mode: bookingType })
            setPaid({
              paymentId,
              phase: 'failed',
              refundMessage: outcome.message,
            })
          } else {
            setPaid({ paymentId, phase: 'unconfirmed' })
          }
        },
        onDismiss: () => {
          toast.info('Payment cancelled. Nothing was booked.')
        },
        onFailure: (message) => {
          // Razorpay refused the payment (a declined card, a failed UPI).
          track('pay_failed', { vendorId, mode: bookingType })
          toast.error(message)
        },
      })
    } catch (error) {
      // A code can lapse between Apply and Pay — someone else took the last
      // use, or it expired. Drop it so the retry goes through at full price.
      if (error instanceof ApiError && error.code?.startsWith('DISCOUNT_')) {
        setAppliedPromo(null)
        toast.error(error.message)
      } else if (
        error instanceof ApiError &&
        (error.code === 'SLOT_TOO_SOON' ||
          error.code === 'INVALID_SCHEDULED_AT' ||
          error.code === 'SLOT_FULL' ||
          error.code === 'GARAGE_CLOSED_THAT_DAY')
      ) {
        // The chosen time ran out of notice, was booked up by someone else, or
        // the garage marked the day a holiday, all before Pay (nothing was
        // charged: the server refuses before any payment order exists). Clear
        // it, fetch fresh times, and take the customer back to choose again.
        setSelectedSlot(null)
        void queryClient.invalidateQueries({ queryKey: slotKeys.all })
        toast.error(
          error.code === 'SLOT_TOO_SOON' && isPickup
            ? `That time is too soon now. ${noticeSentence('pickup')} Pick a later time.`
            : error.message
        )
        goToStep('slot')
      } else if (
        error instanceof ApiError &&
        error.code === 'PICKUP_NOT_OFFERED'
      ) {
        // The garage switched pickup & drop off since this page loaded.
        // Reloading it moves the switch to a mode it still offers, and the
        // notice at the top says so; nothing was charged.
        toast.error(
          `This garage has stopped offering pickup & drop.${
            otherMode
              ? ` You can book ${BOOKED_AS[otherMode]} instead, or pick another garage.`
              : ' Pick another garage.'
          }`
        )
        void getVendor(vendorId).then((v) => v && setVendor(v))
      } else if (
        error instanceof ApiError &&
        error.code === 'OUTSIDE_PICKUP_RADIUS'
      ) {
        if (selectedAddress) {
          setRefusedAddressIds((current) => [
            ...new Set([...current, selectedAddress]),
          ])
        }
        toast.error(outsideAdvice)
        goToStep('address')
      } else if (
        error instanceof ApiError &&
        error.code === 'ADDRESS_REQUIRED'
      ) {
        toast.error(
          isPickup
            ? 'Choose the address we should collect your car from.'
            : 'Choose the address we should come to.'
        )
        goToStep('address')
      } else if (
        error instanceof ApiError &&
        error.code === 'ADDRESS_LOCATION_REQUIRED'
      ) {
        // The saved copy here thought it had a pin. Fetch the addresses
        // again, so the pin step shows for the one that has none.
        toast.error(
          isPickup
            ? 'Pin your address on the map so the garage can find your car.'
            : 'Pin your address on the map so the garage can find you.'
        )
        void getAddresses()
          .then((fresh) => {
            useUserStore.setState({ addresses: fresh })
            requestAnimationFrame(() => goToStep('pin'))
          })
          .catch(() => undefined)
      } else if (
        error instanceof ApiError &&
        error.code?.startsWith('CREDIT_')
      ) {
        // The credit moved since this page read it (spent on another
        // booking, or ran out). Nothing was charged; read it again so the
        // row shows what is there now.
        void invalidateGiftData(queryClient)
        toast.error(error.message)
      } else if (
        !(error instanceof RazorpayReportedError) &&
        error instanceof Error
      ) {
        // Anything the sheet already reported — a dismissal, a declined card —
        // has been shown once already.
        toast.error(error.message)
      }
    } finally {
      bookingLockRef.current = false
      setLoading(false)
    }
  }

  // The bottom bar grows with what it has to say (the total, the promises
  // above Pay, a town line); the page leaves exactly that much room under
  // the last section, plus a little air.
  const barRef = useRef<HTMLDivElement>(null)
  const [barHeight, setBarHeight] = useState(176)
  useEffect(() => {
    const bar = barRef.current
    if (!bar || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setBarHeight(bar.offsetHeight))
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])

  // Checked after every hook above, which must run on every render.
  if (loadProblem) {
    return (
      <AppShell className="gap-4 pt-0">
        <PageHeader title="Book your wash" />
        {loadProblem === 'gone' ? (
          // The garage page's own words for a garage that is not listed:
          // unverified, archived, or never was.
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-[15px] text-text-secondary">
              This garage isn&apos;t taking bookings on Detlio.
            </p>
            <Link
              href="/garages"
              className="flex min-h-11 items-center px-3 text-[15px] font-medium text-text-primary underline underline-offset-2"
            >
              Find another garage
            </Link>
          </div>
        ) : (
          <ErrorState
            message="Couldn't load this garage. Check your connection."
            onRetry={() => {
              setLoadProblem(null)
              setLoadAttempt((n) => n + 1)
            }}
          />
        )}
      </AppShell>
    )
  }

  const selectedCar = vehicles.find((v) => v.id === selectedVehicle) ?? null
  // The server's rule (lib/guarantee-cover.ts): only when every line is a
  // wash or detailing, or a package made only of those.
  const guaranteeApplies =
    guaranteeOn &&
    guaranteeCovers(selectedServices, (serviceId) => categoryById[serviceId])
  // Applied for the customer (F1) and still standing.
  const suggestionApplied =
    !!appliedReward && appliedReward.code === suggestedCode

  return (
    <AppShell className="gap-6 pt-0 pb-0">
      {/* Sticky, not fixed: it keeps its place in the flow. Full-bleed via
          -mx-4 against AppShell's px-4, and opaque so rows scroll under it.
          Below the cookie bar while that is up (--consent-bar). */}
      <PageHeader
        title="Book your wash"
        className="sticky top-(--consent-bar) z-30 -mx-4 bg-brand-black px-4"
      />

      {/* The garage page says this where Book Now would be; a customer can
          still land here from Book again or an old link. Neutral: there is
          nothing here for the customer to fix. The server refuses the
          booking either way (GARAGE_PAUSED). */}
      {vendor?.bookingsPaused && (
        <Notice
          role="status"
          tone="neutral"
          title="Not taking bookings right now"
        >
          {vendor.bookingsPausedReason ||
            'This garage has paused new bookings. Check back later, or pick another garage.'}
        </Notice>
      )}

      {modeWithdrawn && (
        <Notice
          role="status"
          tone="neutral"
          title={`${BOOKING_TYPE_LABELS[modeWithdrawn]} isn't offered here now`}
        >
          {`This booking will be ${BOOKED_AS[bookingType]}.`}
        </Notice>
      )}

      {servicesDropped && (
        <Notice
          role="status"
          tone="neutral"
          title="Some services are no longer offered"
        >
          This garage has stopped offering some of the services you picked, so
          they&apos;ve been left out.
        </Notice>
      )}

      {/* What is being booked, where, and for how much: the price is for the
          customer's own car from the first second (F1, F7), and the garage's
          rating and Certified mark ride along (F4). Each line can be removed
          here, so dropping one never means going back a screen and losing
          the time and any code. */}
      {vendor && selectedServices.length > 0 && (
        <section aria-label="Your booking" className="hub-card p-5">
          <div className="flex items-start justify-between gap-3">
            <h2
              ref={summaryStepRef}
              tabIndex={-1}
              className="min-w-0 scroll-mt-20 text-[17px] font-medium tracking-[-0.01em] text-text-primary outline-none"
            >
              {vendor.name}
            </h2>
            {vendor.reviewCount > 0 ? (
              <span className="flex shrink-0 items-center gap-1 pt-0.5 text-[13px] text-text-primary">
                <IconStarFilled
                  size={13}
                  aria-hidden
                  className="text-text-primary"
                />
                <span className="font-numeric">{vendor.rating.toFixed(1)}</span>
                <span className="text-dim">
                  (<span className="font-numeric">{vendor.reviewCount}</span>)
                </span>
                <span className="sr-only">
                  {' '}
                  stars from {vendor.reviewCount} reviews
                </span>
              </span>
            ) : (
              <span className="shrink-0 pt-0.5 text-[13px] text-dim">
                New on Detlio
              </span>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-dim">
            {vendor.certified && (
              <span className="flex items-center gap-1 text-text-primary">
                <IconCircleCheckFilled
                  size={15}
                  aria-hidden
                  className="text-success"
                />
                Detlio Certified
              </span>
            )}
            {[vendor.area, vendor.distanceKm != null ? vendor.distance : null]
              .filter(Boolean)
              .join(' · ')}
          </p>

          <div className="mt-4 flex flex-col gap-2.5 border-t border-line pt-4">
            {lines.map(({ service, amount }) => (
              <div
                key={service.id}
                className="flex items-start justify-between gap-3 text-[15px]"
              >
                <span className="flex min-w-0 items-start gap-1.5">
                  {selectedServices.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeService(service.id)}
                      aria-label={`Remove ${service.name}`}
                      // 44pt tall to the thumb, drawn as a small cross.
                      className="-my-2.5 -ml-3 flex size-11 shrink-0 items-center justify-center text-text-muted transition-colors hover:text-text-primary"
                    >
                      <IconX size={15} aria-hidden="true" />
                    </button>
                  )}
                  <span className="min-w-0 text-text-secondary">
                    {service.name}
                    {vehicleTierLabel &&
                      service.pricingType === 'per_vehicle' && (
                        <span className="text-text-muted">
                          {' '}
                          · {vehicleTierLabel}
                        </span>
                      )}
                  </span>
                </span>
                {/* Not priced is a problem, so it is amber like every other
                    error: red would read as something to tap. */}
                <span
                  className={cn(
                    'shrink-0',
                    amount == null && selectedVehicleType != null
                      ? 'text-error'
                      : 'text-text-primary'
                  )}
                >
                  {amount == null && selectedVehicleType != null ? (
                    'Not priced'
                  ) : (
                    <Figures
                      text={servicePriceText(service, selectedVehicleType)}
                    />
                  )}
                </span>
              </div>
            ))}
            <p className="text-[13px] text-dim">
              <span className="font-numeric">
                {formatDuration(totalDuration)}
              </span>{' '}
              · {BOOKING_TYPE_LABELS[bookingType]}
            </p>
          </div>
        </section>
      )}

      {/* At garage, Doorstep or Pickup & drop on one line, only when the
          garage offers more than one. */}
      {modeOptions.length > 1 && (
        <section aria-labelledby="checkout-mode">
          <h2 id="checkout-mode" className="sr-only">
            Service type
          </h2>
          <ScToggle
            options={modeOptions}
            value={bookingType}
            onChange={setChosenType}
            className="whitespace-nowrap"
          />
          {isPickup && (
            <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
              {vendor?.name ?? 'The garage'} collects your car from your
              address, works on it at the garage and brings it back.
            </p>
          )}
        </section>
      )}

      {/* The earliest day with a free time is already picked, so the times
          show at once (F1); morning first. */}
      <section
        ref={slotStepRef}
        tabIndex={-1}
        aria-label="Date and time"
        className="scroll-mt-20 outline-none"
      >
        <WhenPicker
          autoPick
          vendorId={vendorId}
          serviceIds={serviceIds}
          value={selectedSlot}
          onChange={pickSlot}
          bookingType={bookingType}
          onLapse={handleSlotLapse}
          initialDate={dateParam}
          // A day with nothing left: "Notify me if a slot opens" (0047).
          renderDayExtra={(state) => (
            <SlotAlertAsk
              state={state}
              vendorId={vendorId}
              serviceIds={serviceIds}
              bookingType={bookingType}
            />
          )}
        />
      </section>

      {/* The car, already picked (F1): the default one, or the one on Home. */}
      <section>
        <h2
          ref={carStepRef}
          tabIndex={-1}
          className="mb-3 scroll-mt-20 text-[17px] font-medium tracking-[-0.01em] text-text-primary outline-none"
        >
          Car
        </h2>
        {vehicles.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-[22px] border border-warning/40 bg-warning-muted/20 p-4">
            <p className="text-[15px] text-text-primary">
              Add a car to continue
            </p>
            <p className="text-[13px] text-text-secondary">
              We need to know which car we&apos;re washing — pricing can differ
              by type.
            </p>
            <button
              type="button"
              onClick={() => setAddCarOpen(true)}
              className="press mt-1 inline-flex h-11 items-center gap-1.5 rounded-pill border border-stroke px-4 text-[15px] text-text-primary"
            >
              <IconPlus size={16} aria-hidden /> Add a car
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {vehicles.map((v) => {
              const on = selectedVehicle === v.id
              return (
                <button
                  key={v.id}
                  type="button"
                  // White, as chosen things are; red here is Pay's.
                  aria-pressed={on}
                  onClick={() => setPickedVehicle(v.id)}
                  className={cn(
                    'press flex min-h-[64px] min-w-0 flex-col justify-center rounded-[18px] border px-4 py-2.5 text-left transition-colors',
                    on
                      ? 'border-text-primary bg-white/[0.04]'
                      : 'border-line bg-white/[0.02]'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-[15px] text-text-primary">
                    <span className="truncate">
                      {v.make} {v.model}
                    </span>
                    {on && (
                      <IconCheck
                        size={15}
                        stroke={2}
                        aria-hidden
                        className="shrink-0"
                      />
                    )}
                  </span>
                  <span
                    className="truncate font-numeric text-[13px] text-dim"
                    data-clarity-mask="true"
                  >
                    {v.plate}
                  </span>
                </button>
              )
            })}
            {/* In place, not a link to /profile: leaving the page would
                discard the time and any applied code. */}
            <button
              type="button"
              onClick={() => setAddCarOpen(true)}
              className="press flex min-h-[64px] items-center justify-center gap-1.5 rounded-[18px] border border-dashed border-stroke text-[13px] text-text-secondary transition-colors hover:text-text-primary"
            >
              <IconPlus size={15} aria-hidden /> Add another car
            </button>
          </div>
        )}
      </section>

      {/* Doorstep and pickup & drop: where to come (or collect the car from),
          picked from the customer's saved addresses so the server can check
          it against the garage's travel or pickup radius. */}
      {usesAddress && (
        <section>
          <h2
            ref={addressStepRef}
            tabIndex={-1}
            className="mb-3 scroll-mt-20 text-[17px] font-medium tracking-[-0.01em] text-text-primary outline-none"
          >
            {isPickup
              ? 'Where should we collect your car?'
              : 'Where should we come?'}
          </h2>
          {isPickup && addresses.length > 0 && (
            <p className="-mt-1 mb-3 text-[13px] text-text-secondary">
              The garage brings your car back to the same address.
            </p>
          )}
          {addresses.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-[22px] border border-warning/40 bg-warning-muted/20 p-4">
              <p className="text-[15px] text-text-primary">
                Add an address to continue
              </p>
              <p className="text-[13px] text-text-secondary">
                {isPickup
                  ? 'Pickup & drop needs the address your car is collected from.'
                  : 'Doorstep service needs somewhere to go.'}
              </p>
              {/* In place, as with cars: sign-up no longer asks for an
                  address, so this is where a new customer gives one. */}
              <button
                type="button"
                onClick={() => setAddAddressOpen(true)}
                className="press mt-1 inline-flex h-11 items-center gap-1.5 rounded-pill border border-stroke px-4 text-[15px] text-text-primary"
              >
                <IconPlus size={16} aria-hidden /> Add an address
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {addresses.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={selectedAddress === a.id}
                  onClick={() => pickAddress(a.id)}
                  className={cn(
                    'press flex items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition-colors',
                    selectedAddress === a.id
                      ? 'border-text-primary bg-white/[0.04]'
                      : 'border-line bg-white/[0.02]'
                  )}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.06]">
                    <IconMapPin
                      size={18}
                      stroke={1.5}
                      className="text-text-primary"
                      aria-hidden
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] text-text-primary">
                      {a.label}
                    </span>
                    <span
                      className="block truncate text-[13px] text-text-secondary"
                      data-clarity-mask="true"
                    >
                      {a.address}
                    </span>
                    {/* Said on every address it applies to, so the customer
                        can see which of theirs would work before tapping. */}
                    {outsidePickup(a) && (
                      <span className="mt-0.5 block text-[13px] text-error">
                        Outside this garage&apos;s pickup area
                      </span>
                    )}
                  </span>
                </button>
              ))}

              {addressOutside && (
                <div
                  role="status"
                  className="flex flex-col gap-2 rounded-[18px] border border-warning/40 bg-warning-muted/20 p-4"
                >
                  <p className="text-[15px] text-text-primary">
                    This garage doesn&apos;t pick up from this address
                  </p>
                  <p className="text-[13px] text-text-secondary">
                    Try another address
                    {otherMode
                      ? `, or book ${BOOKED_AS[otherMode]} instead`
                      : ''}
                    .
                  </p>
                  {otherMode && (
                    <button
                      type="button"
                      onClick={() => setChosenType(otherMode)}
                      className="press mt-1 inline-flex h-11 items-center self-start rounded-pill border border-stroke px-4 text-[15px] text-text-primary"
                    >
                      Choose {BOOKING_TYPE_LABELS[otherMode]}
                    </button>
                  )}
                </div>
              )}

              {addressNeedsPin && (
                <div className="flex flex-col gap-2 rounded-[18px] border border-warning/40 bg-warning-muted/20 p-4">
                  <p
                    ref={pinStepRef}
                    tabIndex={-1}
                    className="scroll-mt-20 text-[15px] text-text-primary outline-none"
                  >
                    Pin the exact spot
                  </p>
                  <p className="text-[13px] text-text-secondary">
                    {isPickup
                      ? 'We need it to check this garage collects from you, and so the driver finds your car.'
                      : 'We need it to check this garage travels to you.'}
                    {pinningAddress ? ' Saving...' : ''}
                  </p>
                  <LocationPicker showSearch onChange={handlePinAddress} />
                </div>
              )}

              <button
                type="button"
                onClick={() => setAddAddressOpen(true)}
                className="press flex min-h-12 items-center justify-center gap-1.5 rounded-[18px] border border-dashed border-stroke text-[13px] text-text-secondary transition-colors hover:text-text-primary"
              >
                <IconPlus size={15} aria-hidden /> Add another address
              </button>
            </div>
          )}
        </section>
      )}

      {/* Savings: the best reward already applied (F1), codes, and Detlio
          credit. Shown once there is a car to price against. Quiet chips:
          red on checkout is Pay's alone. */}
      {selectedServices.length > 0 &&
        selectedVehicle &&
        !unpricedForVehicle && (
          <section aria-labelledby="checkout-savings">
            <h2
              id="checkout-savings"
              className="mb-3 text-[17px] font-medium tracking-[-0.01em] text-text-primary"
            >
              Savings
            </h2>
            <div className="hub-card flex flex-col px-5 py-1">
              {appliedDiscount ? (
                <div className="flex min-h-[60px] items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[15px] text-text-primary">
                      {suggestionApplied && appliedReward
                        ? `Best for you: ${appliedReward.label}`
                        : appliedReward
                          ? `${appliedReward.label} applied`
                          : appliedCoupon
                            ? `Coupon applied: ${appliedCoupon.title}`
                            : `${appliedDiscount.code} applied`}
                    </p>
                    <p className="text-[13px] text-success">
                      Saves{' '}
                      <span className="font-numeric">
                        {money(appliedDiscount.discountAmount)}
                      </span>
                      {suggestionApplied ? ' · applied' : ''}
                    </p>
                  </div>
                  {/* Neutral: red on checkout is kept for Pay. */}
                  <button
                    type="button"
                    onClick={handleRemovePromo}
                    className="-mr-2 min-h-11 shrink-0 px-2 text-[15px] text-text-primary"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => setPromoOpen(true)}
                    className="flex min-h-[52px] w-full items-center justify-between gap-3"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-full bg-success-muted text-success">
                        <IconPercentage size={15} aria-hidden />
                      </span>
                      <span className="text-[15px] text-text-primary">
                        Coupons and offers
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-0.5 text-[13px] text-text-primary">
                      {offerChecking ? `Checking ${offerCode}…` : 'Apply'}
                      <IconChevronRight size={15} aria-hidden />
                    </span>
                  </button>
                  {/* The code from Home did not survive a change of car or
                    services: said in the server's words, amber, with Remove
                    beside it since the customer never typed it. */}
                  {offerProblem && (
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p
                        role="status"
                        className="flex items-start gap-1.5 text-[13px] text-error"
                      >
                        <IconAlertCircle
                          size={15}
                          className="mt-px shrink-0"
                          aria-hidden="true"
                        />
                        <span>
                          {offerCode} doesn&apos;t apply to this booking.{' '}
                          {offerProblem}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={handleRemovePromo}
                        aria-label={`Remove ${offerCode}`}
                        className="-mr-2 min-h-11 shrink-0 px-2 text-[13px] text-text-primary"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  {/* Detlio Rewards (0050) and printed coupons (0056): one tap,
                    the same check as a typed code. */}
                  {(rewardVouchers.length > 0 || myCoupons.length > 0) && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {rewardVouchers.slice(0, 4).map((voucher) => (
                        <button
                          key={voucher.id}
                          type="button"
                          disabled={applyPromo.isPending}
                          onClick={() => handleApplyReward(voucher.code!)}
                          className="flex min-h-11 items-center gap-1.5 rounded-full border border-stroke px-3.5 text-[13px] text-text-primary disabled:opacity-50"
                        >
                          <span className="font-numeric">
                            {rewardRupees(voucher.amount)} off
                          </span>
                          <span className="text-text-secondary">
                            · {voucher.label}
                          </span>
                        </button>
                      ))}
                      {myCoupons.slice(0, 4).map((coupon) => (
                        <button
                          key={coupon.id}
                          type="button"
                          disabled={applyPromo.isPending}
                          onClick={() => handleApplyReward(coupon.code)}
                          className="flex min-h-11 items-center rounded-full border border-stroke px-3.5 text-[13px] text-text-primary disabled:opacity-50"
                        >
                          {coupon.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Detlio credit (0049): a switch, on by default. */}
              {creditOffered && (
                <div className="flex min-h-[60px] items-center justify-between gap-3 border-t border-line">
                  <span className="min-w-0 text-[15px] text-text-primary">
                    Use{' '}
                    <span className="font-numeric">
                      {money(creditSplit.credit)}
                    </span>{' '}
                    Detlio credit
                  </span>
                  <ScSwitch
                    label="Use Detlio credit"
                    checked={creditSwitchOn}
                    disabled={loading}
                    onChange={setCreditSwitchOn}
                    className="-mr-2"
                  />
                </div>
              )}
            </div>
          </section>
        )}

      {/* The price, worked out in full: the customer should see the sum
          that produced what they are about to pay. */}
      {selectedServices.length > 0 && (
        <section
          aria-labelledby="checkout-price"
          className="flex flex-col gap-3"
        >
          <h2 id="checkout-price" className="sr-only">
            Price
          </h2>
          <div className="hub-card flex flex-col gap-3 p-5 text-[15px]">
            {/* Only once there is more than one line to add up. */}
            {selectedServices.length > 1 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-secondary">Subtotal</span>
                <span className="font-numeric text-text-primary">
                  {subtotal == null || !selectedVehicle ? '—' : money(subtotal)}
                </span>
              </div>
            )}
            {/* Pickup & drop's own line: free for now (owner decision). */}
            {isPickup && (
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 text-text-secondary">
                  <span className="block">Pickup &amp; drop</span>
                  {selectedAddressRecord && (
                    <span
                      className="block truncate text-[13px] text-text-muted"
                      data-clarity-mask="true"
                    >
                      From and back to {selectedAddressRecord.address}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-success">
                  {pickupFeeLabel(0)}
                </span>
              </div>
            )}
            {appliedDiscount && (
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-text-secondary">
                  Discount ({appliedDiscount.code})
                </span>
                <span className="shrink-0 font-numeric text-success">
                  −{money(appliedDiscount.discountAmount)}
                </span>
              </div>
            )}
            {creditApplied && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-secondary">Detlio credit</span>
                <span className="shrink-0 font-numeric text-success">
                  −{money(creditSplit.credit)}
                </span>
              </div>
            )}
            <div
              className={cn(
                'flex items-center justify-between gap-3',
                (selectedServices.length > 1 ||
                  isPickup ||
                  appliedDiscount ||
                  creditApplied) &&
                  'border-t border-line pt-3'
              )}
            >
              <span className="text-[17px] text-text-primary">To pay</span>
              <span className="font-numeric text-[20px] text-text-primary">
                {toPay == null || !selectedVehicle ? '—' : money(toPay)}
              </span>
            </div>
          </div>

          {/* Before paying, on purpose (owner decision): who has the car
              while it is away. */}
          {isPickup && (
            <p className="flex items-start gap-1.5 text-[13px] leading-relaxed text-text-primary">
              <IconShieldCheck
                size={16}
                className="mt-px shrink-0 text-text-secondary"
                aria-hidden="true"
              />
              <span>{PICKUP_RESPONSIBILITY_LINE}</span>
            </p>
          )}

          {/* An inspection fee is not the whole price: how the rest is
              charged, before anyone pays the fee. */}
          {selectedServices.some(
            (service) => service.pricingType === 'on_inspection'
          ) && (
            <p className="text-[13px] leading-relaxed text-text-secondary">
              You pay the inspection fee now. If the work costs more, the garage
              sends the final bill in the app and you pay the rest here.
            </p>
          )}

          {/* Mirrors what the server enforces: CANCELLATION_CUTOFF_MS and
              MAX_RESCHEDULES in bookings.service.ts, and the no-show rule ops
              applies (markNoShow). */}
          <p className="text-[12px] leading-relaxed text-text-muted">
            <span className="text-text-secondary">Cancellation policy:</span>{' '}
            Cancel any time until the garage accepts. Once it has, cancel or
            reschedule up to 2 hours before your slot. You can reschedule up to
            2 times; each new time goes back to the garage to accept, and if it
            can&apos;t take it, the booking is cancelled. If you don&apos;t turn
            up for an accepted booking, it isn&apos;t refunded.
            {isPickup &&
              ' Once the garage has collected your car, the booking can’t be cancelled or moved in the app.'}
          </p>
        </section>
      )}

      {/* Room under the last section for the fixed bar, whatever it holds. */}
      <div
        aria-hidden
        className="shrink-0"
        style={{ height: `calc(${barHeight}px + env(safe-area-inset-bottom))` }}
      />

      <AddCarSheet
        open={addCarOpen}
        onClose={() => setAddCarOpen(false)}
        onAdded={(vehicle) => setPickedVehicle(vehicle.id)}
        hero={isHomeHubEnabled()}
      />

      <AddAddressSheet
        open={addAddressOpen}
        onClose={() => setAddAddressOpen(false)}
        onAdded={(address) => pickAddress(address.id)}
        pickup={isPickup}
      />

      {/* Coupon entry as a sheet: the summary never reflows under the
          customer, and the field gets room plus a keyboard. */}
      <ScSheet
        open={promoOpen}
        onClose={() => setPromoOpen(false)}
        dismissible={!applyPromo.isPending}
        aria-label="Coupons and offers"
        className="px-4"
      >
        <h2 className="text-[20px] font-normal tracking-[-0.015em] text-text-primary">
          Coupons and offers
        </h2>

        <div className="mt-4 flex items-center gap-2 rounded-[14px] border border-line bg-white/[0.03] px-3">
          <input
            id="promo-code"
            aria-label="Coupon code"
            aria-invalid={promoError ? true : undefined}
            aria-describedby={promoError ? 'promo-code-error' : undefined}
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="Enter coupon code"
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
            className="min-w-0 flex-1 bg-transparent py-3.5 text-[15px] uppercase text-text-primary outline-none placeholder:normal-case placeholder:text-text-muted"
          />
          {/* White, not red: the sheet's action is a text action (F5). */}
          <button
            type="button"
            disabled={!canApplyPromo || applyPromo.isPending}
            onClick={handleApplyPromo}
            className="-mr-1 min-h-11 shrink-0 px-2 text-[15px] font-medium text-text-primary transition-colors disabled:text-text-muted"
          >
            {applyPromo.isPending ? 'Checking…' : 'Apply'}
          </button>
        </div>

        {/* Amber with an icon, never red. Kept a single <p>: the e2e page
            object finds the message as the sheet's one paragraph that is not
            the static hint below. */}
        {promoError && (
          <p
            id="promo-code-error"
            role="alert"
            className="mt-2 flex items-start gap-1.5 text-[13px] text-error"
          >
            <IconAlertCircle
              size={15}
              className="mt-px shrink-0"
              aria-hidden="true"
            />
            {promoError}
          </p>
        )}

        <p className="mt-4 text-[13px] text-text-muted">
          Have a code from Detlio? Enter it above to see your savings before you
          pay.
        </p>
      </ScSheet>

      <div
        ref={barRef}
        className="fixed bottom-0 left-1/2 z-40 w-full max-w-[428px] -translate-x-1/2 border-t border-line bg-brand-black px-4 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]"
      >
        {/* Says each step after payment out loud. On the page from the first
            render and only its text changes, so it is announced. */}
        <p role="status" className="sr-only">
          {paid?.phase === 'confirming'
            ? 'Payment received. Confirming your booking.'
            : paid
              ? paymentReceivedText(
                  paid.paymentId,
                  paid.phase === 'failed' ? paid.refundMessage : undefined
                )
              : ''}
        </p>
        {paid && paid.phase !== 'confirming' ? (
          // Paid, and no booking to show yet (or one that could not be made).
          // Pay is gone from this screen for good.
          <PaymentReceivedPanel
            paymentId={paid.paymentId}
            refundMessage={
              paid.phase === 'failed' ? paid.refundMessage : undefined
            }
          />
        ) : paid ? (
          // Graphite with a spinner, not the red pill: red means "this pays".
          <ScButton
            disabled
            className="flex h-[52px] items-center justify-center gap-2 rounded-full bg-surface-elevated py-0 text-[15px] font-medium text-text-primary ring-1 ring-inset ring-border hover:bg-surface-elevated disabled:cursor-wait disabled:opacity-100"
          >
            <IconLoader2
              size={16}
              className="shrink-0 animate-spin"
              aria-hidden="true"
            />
            Payment received — confirming your booking…
          </ScButton>
        ) : (
          <>
            {/* The running total from the first second (F1): what, for which
                car, and how much. */}
            {selectedServices.length > 0 && (
              <div className="mb-2.5 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-dim">
                  {formatServiceSummary(
                    selectedServices.map((service) => service.name)
                  )}
                  {selectedCar ? ` · ${selectedCar.model}` : ''}
                </span>
                {subtotal != null && selectedVehicle && (
                  <span className="shrink-0 text-dim">
                    {toPay != null && toPay !== subtotal ? 'To pay' : 'Total'}{' '}
                    <span className="font-numeric text-[15px] text-text-primary">
                      {money(toPay ?? subtotal)}
                    </span>
                  </span>
                )}
              </div>
            )}
            {/* Two promises right above Pay, where people hesitate (F4). */}
            {!nextStep && (
              <ul className="mb-2.5 flex flex-col items-center gap-1 text-[13px] text-text-secondary">
                {guaranteeApplies && (
                  // Short, beside Pay; the full promise is on the claim screen.
                  <li
                    className="flex items-center gap-1.5"
                    title={`${GUARANTEE_BADGE} — ${GUARANTEE_SUMMARY}`}
                  >
                    <IconShieldCheck
                      size={15}
                      stroke={1.5}
                      aria-hidden
                      className="shrink-0 text-text-primary"
                    />
                    Free redo within 48 hours if you&apos;re not happy
                  </li>
                )}
                <li className="flex items-center gap-1.5">
                  <IconRefresh
                    size={15}
                    stroke={1.5}
                    aria-hidden
                    className="shrink-0 text-text-primary"
                  />
                  Free cancel until the garage accepts
                </li>
              </ul>
            )}
            {/* Said once more right above Pay, for a garage in another town:
                a fact, never a step. */}
            {vendor?.outsideServiceCity && (
              <OutsideCityLine
                id="checkout-outside-city"
                text={outsideCityCheckoutLine(vendor.outsideServiceCity)}
                className="mb-2 justify-center text-center"
              />
            )}
            <MainAction
              // Disabled only while a payment is opening. Before that it is
              // never a dead end: it names what is missing and goes there.
              disabled={loading}
              aria-describedby={
                vendor?.outsideServiceCity
                  ? 'checkout-outside-city checkout-cta-hint'
                  : 'checkout-cta-hint'
              }
              onClick={nextStep ? () => goToStep(nextStep) : handleConfirm}
              className={cn(
                'h-[52px] rounded-full py-0 text-[15px] font-medium',
                // Grey until the booking is ready, so red only ever means
                // "this pays" (F5's "not ready yet").
                nextStep &&
                  'bg-surface-elevated text-text-primary ring-1 ring-inset ring-border hover:bg-surface-elevated',
                loading && 'disabled:cursor-wait disabled:opacity-100'
              )}
              hero={!nextStep}
              heroClassName={cn(
                loading && 'disabled:cursor-wait disabled:opacity-100'
              )}
              heroIcon={
                !loading && (
                  <IconArrowUpRight size={17} stroke={1.5} aria-hidden />
                )
              }
            >
              {loading ? (
                'Processing payment...'
              ) : !nextStep && applyPromo.isPending ? (
                // Pay waits for the code being checked (see handleConfirm).
                'Checking…'
              ) : nextStep ? (
                stepLabels[nextStep]
              ) : toPay == null ? (
                'Confirm booking'
              ) : toPay === 0 ? (
                'Book with credit'
              ) : (
                <>
                  Pay <span className="font-numeric">{money(toPay)}</span>
                </>
              )}
            </MainAction>
            <p
              id="checkout-cta-hint"
              className="mt-2 text-center text-[12px] leading-snug text-text-muted"
            >
              {nextStep === 'address' ? (
                addresses.length === 0 ? (
                  isPickup ? (
                    'Add the address we should collect your car from.'
                  ) : (
                    'Add the address we should come to.'
                  )
                ) : isPickup ? (
                  'Pick the address we should collect your car from.'
                ) : (
                  'Pick the address we should come to.'
                )
              ) : nextStep === 'pin' ? (
                isPickup ? (
                  'We need the exact spot to check this garage collects from you.'
                ) : (
                  'We need the exact spot to check this garage travels to you.'
                )
              ) : nextStep === 'outside' ? (
                outsideAdvice
              ) : nextStep === 'unpriced' ? (
                `${unpricedLines.map((line) => line.service.name).join(', ')} ${
                  unpricedLines.length === 1 ? 'is' : 'are'
                } not priced for your vehicle type. Remove ${
                  unpricedLines.length === 1 ? 'it' : 'them'
                }, pick another car, or contact the garage.`
              ) : nextStep ? (
                'You pay now. Your booking is confirmed once the garage accepts it.'
              ) : toPay === 0 ? (
                'Paid with your Detlio credit. Your booking is confirmed once the garage accepts it.'
              ) : (
                // Who takes the money, said where people hesitate (F4).
                <>
                  <IconLock
                    size={12}
                    aria-hidden
                    className="mr-1 inline align-[-1px]"
                  />
                  Secure payment by Razorpay · UPI, cards, net banking. Your
                  booking is confirmed once the garage accepts it.
                </>
              )}
            </p>
            {/* Beside Pay, as Razorpay and the E-Commerce Rules expect. New
                tabs, so the time, car and code picked here are still here. */}
            <p className="mt-1 text-center text-[12px] text-text-muted">
              By paying you agree to the{' '}
              <a
                href={LEGAL_PATHS.terms}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-6 items-center underline underline-offset-2 hover:text-text-primary"
              >
                Terms
              </a>{' '}
              and the{' '}
              <a
                href={LEGAL_PATHS.refunds}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-6 items-center underline underline-offset-2 hover:text-text-primary"
              >
                Cancellation &amp; Refund Policy
              </a>
              .
            </p>
          </>
        )}
      </div>
    </AppShell>
  )
}

export default function BookPage({
  params,
}: {
  params: Promise<{ vendorId: string }>
}) {
  const { vendorId } = use(params)
  return (
    <Suspense>
      <BookContent vendorId={vendorId} />
    </Suspense>
  )
}
