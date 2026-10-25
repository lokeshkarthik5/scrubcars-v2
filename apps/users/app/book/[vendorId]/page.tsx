'use client'

import { use, useCallback, useEffect, useRef, useState, Suspense } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  IconAlertCircle,
  IconArrowUpRight,
  IconChevronRight,
  IconLoader2,
  IconMapPin,
  IconPercentage,
  IconPlus,
  IconShieldCheck,
  IconShoppingCart,
  IconX,
} from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { useQueryClient } from '@tanstack/react-query'
import { MainAction } from '@/components/main-action'
import { isHomeHubEnabled } from '@/lib/home-hub'
import { LEGAL_PATHS } from '@/lib/legal/routes'
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
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { ScSheet } from '@repo/ui/sc/modal'
import { Notice } from '@repo/ui/sc/notice'
import { OutsideCityLine } from '@repo/ui/features/outside-city'
import { Reveal } from '@repo/ui/sc/reveal'
import { SlotPicker } from '@repo/ui/sc/slot-picker'
import { SlotAlertAsk } from '@/components/slot-alerts/slot-alert-ask'
import { slotKeys } from '@repo/core/api/hooks/use-slots'
import { ScSwitch } from '@repo/ui/sc/switch'
import { ScToggle } from '@repo/ui/sc/toggle'
import { TopBar } from '@repo/ui/sc/top-bar'
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
import { openRazorpayCheckout, RazorpayReportedError } from '@repo/core/razorpay'
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
import { formatServicePrice, resolveServiceAmount } from '@repo/core/pricing'
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
        const svcs = garage.services
        const catalogue: Service[] = [...garage.services, ...garage.packages]

        // Resolved in the order the ids arrived, not the order the catalogue
        // came back in: that order is the customer's, and it is what the
        // summary and the booking's line items preserve. Only services the
        // garage still sells: a withdrawn one is not in the catalogue.
        const { requested, picked } = pickRequestedServices(serviceIdsParam, catalogue)

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
        setLoadProblem(error instanceof ApiError && error.status === 404 ? 'gone' : 'failed')
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

  // Auto-select only when there is nothing to choose between. With several
  // cars, preselecting one would make the order summary appear the instant a
  // time was picked — collapsing the "pick your car" step the page is built
  // around. With exactly one car, asking for a tap is pure friction.
  //
  // Derived rather than written back by an effect, for the same reason
  // `appliedDiscount` below is: with one car there is no render where the
  // selection is still empty, and nothing has to re-fire when the car list
  // arrives.
  //
  // The car the customer was looking at on Home when they tapped Book a wash
  // or an offer is a choice already made, so it is preselected — if it is
  // still one of their saved cars (it may have been removed since).
  const homeVehicle = vehicles.some((v) => v.id === livePending?.vehicleId)
    ? livePending!.vehicleId
    : null
  const selectedVehicle =
    pickedVehicle ?? homeVehicle ?? (vehicles.length === 1 ? vehicles[0].id : null)

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
    ? offeredBookingTypes(vendor).map((value) => ({ value, label: BOOKING_TYPE_LABELS[value] }))
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
  const linkedAddress = addresses.some((a) => a.id === addressParam) ? addressParam : null
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
      (!(address.lat === 0 && address.lng === 0) && insidePickupReach(vendor, address) === false))
  const addressOutside = selectedAddressRecord != null && !addressNeedsPin && outsidePickup(selectedAddressRecord)
  // The way forward when this garage cannot collect: another mode it offers.
  const otherMode = vendor ? offeredBookingTypes(vendor).find((type) => type !== 'pickup') ?? null : null
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

  const selectedVehicleType = vehicles.find((v) => v.id === selectedVehicle)?.vehicleType
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
    const label = new Date(scheduledAt).toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    })
    toast.info(`${label} is now too soon to book. ${noticeSentence(bookingType)} Pick another time.`)
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
    offerCode && selectedServices.length > 0 && selectedVehicle && !unpricedForVehicle
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
        onSuccess: (applied) => setAppliedPromo({ discount: applied, serviceKey: key, vehicleId }),
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
    // A code from Home goes for good: not re-applied on the next change here,
    // nor at the next garage.
    if (offerCode) {
      setOfferDropped(true)
      forgetPendingCode()
      // And off the link, so a reload or a shared link does not bring it back.
      if (codeParam) {
        const next = new URLSearchParams(searchParams.toString())
        next.delete('code')
        router.replace(`/book/${vendorId}?${next.toString()}`, { scroll: false })
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
    !!offerCode && applyPromo.isPending && applyPromo.variables?.code === offerCode
  const offerProblem =
    offerCode && !appliedDiscount && !offerChecking && applyPromo.variables?.code === offerCode
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
      toast.error(err instanceof Error ? err.message : 'Could not save that location')
    } finally {
      setPinningAddress(false)
    }
  }

  const handleConfirm = async () => {
    if (paidRef.current || bookingLockRef.current || loading) return
    if (selectedServices.length === 0 || !selectedSlot || !selectedVehicle) return
    if (!addressReady) return
    bookingLockRef.current = true
    setLoading(true)
    // The price as a band, never the amount.
    track('pay_click', {
      vendorId,
      mode: bookingType,
      serviceCount: selectedServices.length,
      amountBucket: payableAmount === null ? undefined : amountBucket(payableAmount),
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
        void invalidateHome(queryClient)
        void invalidateGiftData(queryClient)
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
        )} at ${vendor?.name ?? 'vendor'}`,
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
            verify: () =>
              verifyPayment({
                intentId: order.intentId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: paymentId,
                razorpaySignature: response.razorpay_signature,
              }),
            poll: async () => intentPollResult(await getBookingIntentStatus(order.intentId)),
            ...realClock,
          })

          // Home's bill, tiles and bell all move with a new booking, and
          // the credit with a booking that used some.
          void invalidateHome(queryClient)
          if (creditApplied) void invalidateGiftData(queryClient)
          if (outcome.kind === 'booked') {
            // The offer and car Home handed over have done their job.
            clearPending()
            // ?celebrate=1 triggers the success burst on arrival; the booking
            // page strips it once played.
            router.push(`/bookings/${outcome.bookingId}?celebrate=1`)
          } else if (outcome.kind === 'failed') {
            setPaid({ paymentId, phase: 'failed', refundMessage: outcome.message })
          } else {
            setPaid({ paymentId, phase: 'unconfirmed' })
          }
        },
        onDismiss: () => {
          toast.info('Payment cancelled. Nothing was booked.')
        },
        onFailure: (message) => {
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
      } else if (error instanceof ApiError && error.code === 'PICKUP_NOT_OFFERED') {
        // The garage switched pickup & drop off since this page loaded.
        // Reloading it moves the switch to a mode it still offers, and the
        // notice at the top says so; nothing was charged.
        toast.error(
          `This garage has stopped offering pickup & drop.${
            otherMode ? ` You can book ${BOOKED_AS[otherMode]} instead, or pick another garage.` : ' Pick another garage.'
          }`
        )
        void getVendor(vendorId).then((v) => v && setVendor(v))
      } else if (error instanceof ApiError && error.code === 'OUTSIDE_PICKUP_RADIUS') {
        if (selectedAddress) {
          setRefusedAddressIds((current) => [...new Set([...current, selectedAddress])])
        }
        toast.error(outsideAdvice)
        goToStep('address')
      } else if (error instanceof ApiError && error.code === 'ADDRESS_REQUIRED') {
        toast.error(
          isPickup ? 'Choose the address we should collect your car from.' : 'Choose the address we should come to.'
        )
        goToStep('address')
      } else if (error instanceof ApiError && error.code === 'ADDRESS_LOCATION_REQUIRED') {
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
      } else if (error instanceof ApiError && error.code?.startsWith('CREDIT_')) {
        // The credit moved since this page read it (spent on another
        // booking, or ran out). Nothing was charged; read it again so the
        // row shows what is there now.
        void invalidateGiftData(queryClient)
        toast.error(error.message)
      } else if (!(error instanceof RazorpayReportedError) && error instanceof Error) {
        // Anything the sheet already reported — a dismissal, a declined card —
        // has been shown once already.
        toast.error(error.message)
      }
    } finally {
      bookingLockRef.current = false
      setLoading(false)
    }
  }

  // Checked after every hook above, which must run on every render.
  if (loadProblem) {
    return (
      <AppShell className="gap-4 pt-0">
        <TopBar
          showBack
          center
          title="Pick a Slot"
          className="sticky top-0 z-30 -mx-4 mb-1 border-b border-border bg-brand-black px-4"
        />
        {loadProblem === 'gone' ? (
          // The garage page's own words for a garage that is not listed:
          // unverified, archived, or never was.
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-[13px] text-text-secondary">
              This garage isn&apos;t taking bookings on Detlio.
            </p>
            <Link
              href="/garages"
              className="flex min-h-11 items-center px-3 text-[13px] font-semibold text-text-primary underline"
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

  return (
    <AppShell
      className={cn(
        'gap-7 pt-0',
        // The payment-received panel stands taller than the button it
        // replaces, so the page leaves it more room to scroll clear of; so
        // does the "not Chennai" line above Pay, for a garage in another town.
        paid && paid.phase !== 'confirming'
          ? 'pb-[calc(12rem_+_env(safe-area-inset-bottom))]'
          : vendor?.outsideServiceCity && !paid
            ? 'pb-[calc(11rem_+_env(safe-area-inset-bottom))]'
            : 'pb-[calc(9.5rem_+_env(safe-area-inset-bottom))]'
      )}
    >
      {/* Sticky, not fixed: it keeps its place in the flow so the content
          below needs no compensating offset. Full-bleed via -mx-4 against
          AppShell's px-4, and opaque so rows scroll under it cleanly. */}
      <TopBar
        showBack
        center
        title="Pick a Slot"
        className="sticky top-0 z-30 -mx-4 mb-1 border-b border-border bg-brand-black px-4"
      />

      {/* The garage page says this where Book Now would be; a customer can
          still land here from Book again or an old link, so checkout says it
          up front instead of only once a date is picked. The server refuses
          the booking either way (GARAGE_PAUSED). */}
      {/* Neutral, as on the garage page: there is nothing here for the
          customer to fix, so it is news, not a warning. */}
      {vendor?.bookingsPaused && (
        <Notice role="status" tone="neutral" title="Not taking bookings right now">
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
        <Notice role="status" tone="neutral" title="Some services are no longer offered">
          This garage has stopped offering some of the services you picked, so
          they&apos;ve been left out.
        </Notice>
      )}

      {/* Identity only — what you're booking and where. Every rupee figure
          lives in the order summary at the bottom, after the choices that
          determine it: a per-vehicle service isn't priced until a car is
          picked, so quoting up here would show a number that later moves. */}
      {selectedServices.length > 0 && vendor && (
        <ScCard className="flex items-center gap-3 py-3.5">
          {vendor.logoUrl && (
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[10px] border border-border bg-surface-elevated">
              <Image
                src={vendor.logoUrl}
                alt={`${vendor.name} logo`}
                fill
                sizes="40px"
                className="object-cover"
              />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-text-primary">{vendor.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-text-secondary">
              <IconShoppingCart size={13} />
              {formatServiceSummary(
                selectedServices.map((service) => service.name)
              )}{' '}
              ·{' '}
              <span className="font-numeric font-medium">
                {formatDuration(totalDuration)}
              </span>
            </p>
          </div>
        </ScCard>
      )}

      {modeOptions.length > 1 && (
        <section>
          <h2 className="mb-2 text-[15px] font-semibold text-text-primary">Service type</h2>
          {/* Two or three choices; "Pickup & drop" fits a third of a 360px
              phone without its label wrapping. */}
          <ScToggle
            options={modeOptions}
            value={bookingType}
            onChange={setChosenType}
            className="whitespace-nowrap"
          />
          {isPickup && (
            <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">
              {vendor?.name ?? 'The garage'} collects your car from your address, works on it at
              the garage and brings it back.
            </p>
          )}
        </section>
      )}

      {/* Each step below appears only once the one before it is answered, so
          the page opens as a single question rather than five stacked ones.
          The picker reveals its own time slots after a date is chosen. */}
      <section
        ref={slotStepRef}
        tabIndex={-1}
        aria-label="Date and time"
        className="scroll-mt-20 outline-none"
      >
        <SlotPicker
          progressive
          vendorId={vendorId}
          serviceIds={serviceIds}
          value={selectedSlot}
          onChange={pickSlot}
          bookingType={bookingType}
          onLapse={handleSlotLapse}
          initialDate={dateParam}
          // A day with nothing left (or nothing in the part of the day the
          // customer wants): "Notify me if a slot opens" (0047).
          renderDayExtra={(state) => (
            <SlotAlertAsk state={state} vendorId={vendorId} serviceIds={serviceIds} bookingType={bookingType} />
          )}
        />
      </section>

      {/* Not in the design, but the booking intent requires a vehicleId — the
          booking can't be created without one. */}
      {selectedSlot && (
        <Reveal as="section">
          <h2
            ref={carStepRef}
            tabIndex={-1}
            className="mb-2 scroll-mt-20 text-[15px] font-semibold text-text-primary outline-none"
          >
            Car details
          </h2>
          {vehicles.length === 0 ? (
            <ScCard className="flex flex-col items-start gap-2 border-warning bg-warning-muted/20">
              <p className="text-[13px] font-medium text-text-primary">
                Add a car to continue
              </p>
              <p className="text-[12px] text-text-secondary">
                We need to know which car we&apos;re washing — pricing can
                differ by type.
              </p>
              <ScButton
                fullWidth={false}
                variant="secondary"
                onClick={() => setAddCarOpen(true)}
                className="mt-1 flex items-center gap-1 px-3 py-1.5 text-[12px]"
              >
                <IconPlus size={14} /> Add a car
              </ScButton>
            </ScCard>
          ) : (
            <div className="flex flex-col gap-2">
              {vehicles.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  // The selected car is otherwise marked only by a white border
                  // on the card inside — white, as chosen things are; red here
                  // is the Pay button's.
                  aria-pressed={selectedVehicle === v.id}
                  onClick={() => setPickedVehicle(v.id)}
                >
                  <ScCard className={cn(selectedVehicle === v.id && 'border-text-primary')}>
                    <p className="text-[13px] font-medium">{v.make} {v.model}</p>
                    <p className="text-[11px] text-text-secondary">{v.plate}</p>
                  </ScCard>
                </button>
              ))}
              {/* In place, not a link to /profile: leaving the page would
                  discard the slot and any applied code. */}
              <button
                type="button"
                onClick={() => setAddCarOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-border py-3 text-[12px] font-medium text-text-secondary transition-colors hover:border-text-secondary hover:text-text-primary"
              >
                <IconPlus size={14} /> Add another car
              </button>
            </div>
          )}
        </Reveal>
      )}

      {/* Doorstep and pickup & drop: the garage has to be told where to come
          (or collect the car from), and the address is picked from the
          customer's saved ones so the server can check it against the
          garage's travel or pickup radius. */}
      {selectedSlot && usesAddress && (
        <Reveal as="section">
          <h2
            ref={addressStepRef}
            tabIndex={-1}
            className="mb-2 scroll-mt-20 text-[15px] font-semibold text-text-primary outline-none"
          >
            {isPickup ? 'Where should we collect your car?' : 'Where should we come?'}
          </h2>
          {isPickup && addresses.length > 0 && (
            <p className="-mt-1 mb-2 text-[12px] text-text-secondary">
              The garage brings your car back to the same address.
            </p>
          )}
          {addresses.length === 0 ? (
            <ScCard className="flex flex-col items-start gap-2 border-warning bg-warning-muted/20">
              <p className="text-[13px] font-medium text-text-primary">
                Add an address to continue
              </p>
              <p className="text-[12px] text-text-secondary">
                {isPickup
                  ? 'Pickup & drop needs the address your car is collected from.'
                  : 'Doorstep service needs somewhere to go.'}
              </p>
              {/* In place, as with cars: sign-up no longer asks for an
                  address, so this is where a new customer gives one, and a
                  link out to /profile would drop the slot and any code. */}
              <ScButton
                fullWidth={false}
                variant="secondary"
                onClick={() => setAddAddressOpen(true)}
                className="mt-1 flex items-center gap-1 px-3 py-1.5 text-[12px]"
              >
                <IconPlus size={14} /> Add an address
              </ScButton>
            </ScCard>
          ) : (
            <div className="flex flex-col gap-2">
              {addresses.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={selectedAddress === a.id}
                  onClick={() => pickAddress(a.id)}
                >
                  <ScCard
                    className={cn(
                      'flex items-center gap-3 text-left',
                      selectedAddress === a.id && 'border-text-primary'
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-surface-elevated">
                      <IconMapPin size={18} className="text-text-primary" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">{a.label}</span>
                      <span className="block truncate text-[11px] text-text-secondary">
                        {a.address}
                      </span>
                      {/* Said on every address it applies to, so the customer
                          can see which of theirs would work before tapping. */}
                      {outsidePickup(a) && (
                        <span className="mt-0.5 block text-[11px] text-error">
                          Outside this garage&apos;s pickup area
                        </span>
                      )}
                    </span>
                  </ScCard>
                </button>
              ))}

              {addressOutside && (
                <ScCard role="status" className="flex flex-col gap-2 border-warning bg-warning-muted/20">
                  <p className="text-[13px] font-medium text-text-primary">
                    This garage doesn&apos;t pick up from this address
                  </p>
                  <p className="text-[12px] text-text-secondary">
                    Try another address{otherMode ? `, or book ${BOOKED_AS[otherMode]} instead` : ''}.
                  </p>
                  {otherMode && (
                    <ScButton
                      fullWidth={false}
                      variant="secondary"
                      onClick={() => setChosenType(otherMode)}
                      className="mt-1 self-start px-3 py-1.5 text-[12px]"
                    >
                      Choose {BOOKING_TYPE_LABELS[otherMode]}
                    </ScButton>
                  )}
                </ScCard>
              )}

              {addressNeedsPin && (
                <ScCard className="flex flex-col gap-2 border-warning bg-warning-muted/20">
                  <p
                    ref={pinStepRef}
                    tabIndex={-1}
                    className="scroll-mt-20 text-[13px] font-medium text-text-primary outline-none"
                  >
                    Pin the exact spot
                  </p>
                  <p className="text-[12px] text-text-secondary">
                    {isPickup
                      ? 'We need it to check this garage collects from you, and so the driver finds your car.'
                      : 'We need it to check this garage travels to you.'}
                    {pinningAddress ? ' Saving...' : ''}
                  </p>
                  <LocationPicker showSearch onChange={handlePinAddress} />
                </ScCard>
              )}

              <button
                type="button"
                onClick={() => setAddAddressOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-border py-3 text-[12px] font-medium text-text-secondary transition-colors hover:border-text-secondary hover:text-text-primary"
              >
                <IconPlus size={14} /> Add another address
              </button>
            </div>
          )}
        </Reveal>
      )}

      {/* Coupons, then the payment summary — the Urban Company cart shape.
          Coupons is a row you tap rather than a form that is always open, and
          the saving reads as a strike-through on the line it applies to
          instead of its own subtotal/discount block. With a single service
          that says the same thing in two rows fewer. */}
      {selectedServices.length > 0 && selectedSlot && selectedVehicle && addressReady && (
        <Reveal as="section" className="flex flex-col gap-4">
          <ScCard className="py-3.5">
            {appliedDiscount ? (
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-success-muted text-success">
                    <IconPercentage size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-text-primary">
                      {appliedDiscount.code} applied
                    </p>
                    <p className="text-[11px] text-success">
                      You save{' '}
                      <span className="font-numeric font-medium">
                        ₹{Number(appliedDiscount.discountAmount).toLocaleString('en-IN')}
                      </span>
                    </p>
                  </div>
                </div>
                {/* Neutral, like the Apply row this replaces: red on checkout
                    is kept for Pay. */}
                <button
                  type="button"
                  onClick={handleRemovePromo}
                  className="-mr-2 min-h-11 shrink-0 px-2 text-[12px] font-medium text-text-primary"
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setPromoOpen(true)}
                  className="flex w-full items-center justify-between gap-3"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="flex size-6 items-center justify-center rounded-full bg-success-muted text-success">
                      <IconPercentage size={14} />
                    </span>
                    <span className="text-[13px] font-medium text-text-primary">
                      Coupons and offers
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-text-primary">
                    {offerChecking ? `Checking ${offerCode}…` : 'Apply'}
                    <IconChevronRight size={14} />
                  </span>
                </button>
                {/* Amber, like the sheet's own errors: the code from Home did
                    not survive a change of car or services, and the customer
                    is told so in the server's words, not left to notice the
                    saving gone. */}
                {/* Remove beside it, as on an applied code: the customer never
                    typed this one, so it is theirs to let go, here and at the
                    next garage, without having to find another code that works. */}
                {offerProblem && (
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p role="status" className="flex items-start gap-1.5 text-[12px] text-error">
                      <IconAlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
                      <span>
                        {offerCode} doesn&apos;t apply to this booking. {offerProblem}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={handleRemovePromo}
                      aria-label={`Remove ${offerCode}`}
                      className="-mr-2 min-h-11 shrink-0 px-2 text-[12px] font-medium text-text-primary"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </>
            )}
          </ScCard>

          <div>
            <h2
              ref={summaryStepRef}
              tabIndex={-1}
              className="mb-2 scroll-mt-20 text-[15px] font-semibold text-text-primary outline-none"
            >
              Payment summary
            </h2>
            <ScCard className="flex flex-col gap-3 py-3.5">
              {/* One row per service, each removable. A cart the customer
                  cannot edit here would send them back a screen to drop one
                  line, losing the slot and any applied code on the way. */}
              {lines.map(({ service, amount }) => (
                <div
                  key={service.id}
                  className="flex items-start justify-between gap-3 text-[13px]"
                >
                  <span className="flex min-w-0 items-start gap-2">
                    {selectedServices.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeService(service.id)}
                        aria-label={`Remove ${service.name}`}
                        // A 36px target around the 14px cross, drawn in the
                        // same spot: the rows sit closer than 44px apart, so
                        // a full 44 would reach into the next row's cross.
                        className="-m-[11px] mt-[-10px] flex size-9 shrink-0 items-center justify-center text-text-muted transition-colors hover:text-text-primary"
                      >
                        <IconX size={14} aria-hidden="true" />
                      </button>
                    )}
                    <span className="min-w-0 text-text-secondary">
                      {service.name}
                      {vehicleTierLabel && (
                        <span className="text-text-muted"> · {vehicleTierLabel}</span>
                      )}
                    </span>
                  </span>
                  {/* Not priced is a problem, so it is amber like every other
                      error — red would read as something to tap. */}
                  <span
                    className={cn(
                      'shrink-0 font-medium',
                      amount == null && selectedVehicleType != null
                        ? 'text-error'
                        : 'text-text-primary'
                    )}
                  >
                    {amount == null && selectedVehicleType != null ? (
                      'Not priced'
                    ) : (
                      <Figures
                        text={formatServicePrice(service, selectedVehicleType)}
                      />
                    )}
                  </span>
                </div>
              ))}

              {/* Pickup & drop's own line: free for now (owner decision), and
                  where a fee would show once one is set (bookingTypeFee on
                  the server). With the address, so the customer checks it
                  once more before paying. */}
              {isPickup && (
                <div className="flex items-start justify-between gap-3 text-[13px]">
                  <span className="min-w-0 text-text-secondary">
                    <span className="block">Pickup &amp; drop</span>
                    {selectedAddressRecord && (
                      <span className="block truncate text-[11px] text-text-muted">
                        From and back to {selectedAddressRecord.address}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-medium text-success">{pickupFeeLabel(0)}</span>
                </div>
              )}

              {/* The subtotal only earns its row once there is more than one
                  line to add up. */}
              {selectedServices.length > 1 && (
                <div className="flex items-start justify-between gap-3 border-t border-border pt-3 text-[13px]">
                  <span className="text-text-secondary">Subtotal</span>
                  <span className="shrink-0 font-numeric font-medium text-text-primary">
                    {subtotal == null
                      ? '—'
                      : `₹${subtotal.toLocaleString('en-IN')}`}
                  </span>
                </div>
              )}

              {/* Spelled out rather than folded into a struck-through price:
                  the discount can be most of the bill, and the customer should
                  see the arithmetic that produced what they are about to pay. */}
              {appliedDiscount && (
                <div className="flex items-start justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-success">
                    Discount ({appliedDiscount.code})
                  </span>
                  <span className="shrink-0 font-numeric font-medium text-success">
                    −₹{Number(appliedDiscount.discountAmount).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border pt-3 text-[15px] font-semibold text-text-primary">
                <span>{creditApplied ? 'Total' : 'Amount to pay'}</span>
                <span className="font-numeric font-bold">
                  {payableAmount == null
                    ? '—'
                    : `₹${payableAmount.toLocaleString('en-IN')}`}
                </span>
              </div>

              {/* Detlio credit (0049), after the promo: a switch, on by
                  default, then what it takes off and what is left. */}
              {creditOffered && (
                <>
                  <div className="-my-1 flex items-center justify-between gap-3 text-[13px]">
                    <span className="min-w-0 text-text-primary">
                      Use{' '}
                      <span className="font-numeric font-medium">
                        ₹{creditSplit.credit.toLocaleString('en-IN')}
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
                  {creditApplied && (
                    <>
                      <div className="flex items-start justify-between gap-3 text-[13px]">
                        <span className="text-success">Detlio credit</span>
                        <span className="shrink-0 font-numeric font-medium text-success">
                          −₹{creditSplit.credit.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-border pt-3 text-[15px] font-semibold text-text-primary">
                        <span>To pay</span>
                        <span className="font-numeric font-bold">
                          ₹{creditSplit.toPay.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </>
                  )}
                </>
              )}
            </ScCard>

            {/* Before paying, on purpose (owner decision): who has the car
                while it is away. */}
            {isPickup && (
              <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-text-primary">
                <IconShieldCheck size={15} className="mt-px shrink-0 text-text-secondary" aria-hidden="true" />
                <span>{PICKUP_RESPONSIBILITY_LINE}</span>
              </p>
            )}

            {/* An inspection fee is not the whole price, and the customer
                should know before paying how the rest is charged: the garage
                raises the final bill after the work and it is paid in the
                app (booking-charges on the server). Nothing promised beyond
                that — no refund of the fee is offered, because there is none. */}
            {selectedServices.some((service) => service.pricingType === 'on_inspection') && (
              <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">
                You pay the inspection fee now. If the work costs more, the
                garage sends the final bill in the app and you pay the rest here.
              </p>
            )}

            {/* Mirrors what the server actually enforces: CANCELLATION_CUTOFF_MS
                (confirmed bookings only) and MAX_RESCHEDULES in
                bookings.service.ts. Deliberately silent on refunds in general —
                there is no automatic refund path, so promising one here would
                be a claim the product can't keep. The no-show line is the one
                exception, and it promises the opposite: an owner decision that
                ops applies from the admin panel (markNoShow). */}
            <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
              <span className="font-medium text-text-secondary">
                Cancellation policy:
              </span>{' '}
              Cancel any time until the garage accepts. Once it has, cancel or
              reschedule up to 2 hours before your slot. You can reschedule up
              to 2 times; each new time goes back to the garage to accept, and
              if it can&apos;t take it, the booking is cancelled. If you
              don&apos;t turn up for an accepted booking, it isn&apos;t refunded.
              {isPickup &&
                ' Once the garage has collected your car, the booking can’t be cancelled or moved in the app.'}
            </p>
          </div>
        </Reveal>
      )}

      {/* Coupon entry as a sheet rather than an inline expander: it keeps the
          summary from reflowing under the customer, and gives the field room
          plus a keyboard without the page jumping. */}
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

      <ScSheet
        open={promoOpen}
        onClose={() => setPromoOpen(false)}
        dismissible={!applyPromo.isPending}
        aria-label="Coupons and offers"
        className="px-4"
      >
        <h2 className="text-[19px] font-semibold text-text-primary">
          Coupons &amp; Offers
        </h2>

        <div className="mt-4 flex items-center gap-2 rounded-[12px] border border-border bg-surface px-3">
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
            className="min-w-0 flex-1 bg-transparent py-3.5 text-[14px] uppercase text-text-primary outline-none placeholder:normal-case placeholder:text-text-muted"
          />
          <button
            type="button"
            disabled={!canApplyPromo || applyPromo.isPending}
            onClick={handleApplyPromo}
            className="-mr-1 min-h-11 shrink-0 px-2 text-[14px] font-semibold text-brand-red transition-colors disabled:text-text-muted"
          >
            {applyPromo.isPending ? 'Checking…' : 'Apply'}
          </button>
        </div>

        {/* Amber with an icon, never red — red in this sheet is Apply. Kept
            a single <p>: the e2e page object finds the message as the sheet's
            one paragraph that is not the static hint below. */}
        {promoError && (
          <p id="promo-code-error" role="alert" className="mt-2 flex items-start gap-1.5 text-[12px] text-error">
            <IconAlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
            {promoError}
          </p>
        )}

        <p className="mt-4 text-[12px] text-text-muted">
          Have a code from Detlio? Enter it above to see your savings before you
          pay.
        </p>
      </ScSheet>

      {/* Height here (~124px: py-3 + the py-4 button + the helper line + the
          terms line; ~150px with the line about a garage in another town) is
          what the page's bottom padding above must clear, plus the iOS home
          indicator inset added to both. */}
      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[428px] -translate-x-1/2 border-t border-border bg-brand-black px-4 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]">
        {/* Says each step after payment out loud. On the page from the first
            render and only its text changes: a live region that mounts with
            its words already in it is usually not announced, and the Pay
            button that had focus is gone by the time any of this happens. */}
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
          // Paid, and no booking to show yet (or one that could not be
          // made). Pay is gone from this screen for good.
          <PaymentReceivedPanel
            paymentId={paid.paymentId}
            refundMessage={paid.phase === 'failed' ? paid.refundMessage : undefined}
          />
        ) : paid ? (
          // Graphite with a spinner, not the red pill: red means "this pays",
          // and a full-strength red button that does nothing gets tapped
          // again and again on a phone, where nothing shows it is disabled.
          <ScButton
            disabled
            className="flex items-center justify-center gap-2 rounded-full bg-surface-elevated py-4 text-[15px] text-text-primary ring-1 ring-inset ring-border hover:bg-surface-elevated disabled:cursor-wait disabled:opacity-100"
          >
            <IconLoader2 size={16} className="shrink-0 animate-spin" aria-hidden="true" />
            Payment received — confirming your booking…
          </ScButton>
        ) : (
          <>
            {/* Said once more right above Pay, for a garage in another town:
                someone who came straight from Book again or a shared link has
                not seen the garage page's line. A fact, never a step: Pay
                works exactly as it would without it. */}
            {vendor?.outsideServiceCity && (
              <OutsideCityLine
                id="checkout-outside-city"
                text={outsideCityCheckoutLine(vendor.outsideServiceCity)}
                className="mb-2 justify-center text-center"
              />
            )}
            <MainAction
              // Disabled only while a payment is opening. Before that it is never
              // a dead end: it names what is missing and tapping it goes there.
              disabled={loading}
              // The town line first: a screen reader that jumps straight to
              // the button (Tab, the rotor) never passes the line above it.
              aria-describedby={
                vendor?.outsideServiceCity
                  ? 'checkout-outside-city checkout-cta-hint'
                  : 'checkout-cta-hint'
              }
              onClick={nextStep ? () => goToStep(nextStep) : handleConfirm}
              className={cn(
                'rounded-full py-4 text-[15px]',
                // Graphite until the booking is ready, so red only ever means
                // "this pays". The disabled red at 40% it replaces read as pink
                // and broken rather than as "not yet".
                nextStep &&
                  'bg-surface-elevated text-text-primary ring-1 ring-inset ring-border hover:bg-surface-elevated',
                loading && 'disabled:cursor-wait disabled:opacity-100'
              )}
              // Behind the Home hub flag, the red pill once there is nothing
              // left to pick, so its shine plays when Pay first appears. Full
              // strength while the payment opens, as today.
              hero={!nextStep}
              heroClassName={cn(loading && 'disabled:cursor-wait disabled:opacity-100')}
              heroIcon={!loading && <IconArrowUpRight size={17} stroke={1.5} aria-hidden />}
            >
              {loading
                ? 'Processing payment...'
                : nextStep
                  ? stepLabels[nextStep]
                  : toPay == null
                    ? 'Confirm booking'
                    : toPay === 0
                      ? 'Book with credit'
                      : (
                        <>
                          Pay{' '}
                          <span className="font-numeric font-bold">
                            ₹{toPay.toLocaleString('en-IN')}
                          </span>
                        </>
                      )}
            </MainAction>
            <p
              id="checkout-cta-hint"
              className="mt-2 text-center text-[11px] text-text-muted"
            >
              {nextStep === 'address'
                ? addresses.length === 0
                  ? isPickup
                    ? 'Add the address we should collect your car from.'
                    : 'Add the address we should come to.'
                  : isPickup
                    ? 'Pick the address we should collect your car from.'
                    : 'Pick the address we should come to.'
                : nextStep === 'pin'
                  ? isPickup
                    ? 'We need the exact spot to check this garage collects from you.'
                    : 'We need the exact spot to check this garage travels to you.'
                  : nextStep === 'outside'
                    ? outsideAdvice
                    : nextStep === 'unpriced'
                    ? `${unpricedLines
                        .map((line) => line.service.name)
                        .join(', ')} ${unpricedLines.length === 1 ? 'is' : 'are'} not priced for your vehicle type. Remove ${unpricedLines.length === 1 ? 'it' : 'them'}, pick another car, or contact the garage.`
                    : // Paying sends the request; the garage's accept is what
                      // confirms it, so the footer does not promise more.
                      toPay === 0
                      ? 'Paid with your Detlio credit. Your booking is confirmed once the garage accepts it.'
                      : 'You pay now. Your booking is confirmed once the garage accepts it.'}
            </p>
            {/* Beside Pay, as Razorpay and the E-Commerce Rules expect: the
                terms and the refund policy a payment accepts. New tabs, so
                the slot, car and promo picked here are still here when the
                customer comes back — this page keeps them only in memory. */}
            <p className="mt-1 text-center text-[11px] text-text-muted">
              By paying you agree to the{' '}
              <a
                href={LEGAL_PATHS.terms}
                target="_blank"
                rel="noopener"
                className="underline underline-offset-2 hover:text-text-primary"
              >
                Terms
              </a>{' '}
              and the{' '}
              <a
                href={LEGAL_PATHS.refunds}
                target="_blank"
                rel="noopener"
                className="underline underline-offset-2 hover:text-text-primary"
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
