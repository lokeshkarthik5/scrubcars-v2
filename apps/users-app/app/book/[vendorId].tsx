import { formatRupees } from '@repo/core/job-records';
import type { AddOn } from '@repo/core/api/add-ons';
import { addOnsAfterRemoving, jobSummary } from '@repo/core/add-ons';
import { ApiError } from '@repo/core/api/client';
import type { AppliedDiscount } from '@repo/core/api/discounts';
import { redeemCoupon } from '@repo/core/api/coupons';
import { useAreaStatus } from '@repo/core/api/hooks/use-area';
import { useMyRequest } from '@repo/core/api/hooks/use-booking-requests';
import { invalidateCoupons, useMyCoupons } from '@repo/core/api/hooks/use-coupons';
import { errorMessage, useValidateDiscount } from '@repo/core/api/hooks/use-discounts';
import { giftsEnabled, invalidateGiftData, useGiftsConfig, useMyCredit } from '@repo/core/api/hooks/use-gifts';
import { useGuaranteeConfig } from '@repo/core/api/hooks/use-guarantee';
import { invalidateHome } from '@repo/core/api/hooks/use-home';
import { invalidateRewards, rewardsEnabled, useRewardsConfig, useRewardsSummary } from '@repo/core/api/hooks/use-rewards';
import { slotKeys } from '@repo/core/api/hooks/use-slots';
import { garageQuery } from '@repo/core/api/hooks/use-vendors';
import { createBookingIntent, getBookingIntentStatus, verifyPayment } from '@repo/core/api/payments';
import { createAddress, createVehicle, getAddresses, updateAddress, updateProfile } from '@repo/core/api/users';
import { getVendor } from '@repo/core/api/vendors';
import { amountBucket } from '@repo/core/analytics-events';
import { pickRequestedServices, unofferedMode } from '@repo/core/book-again';
import { istClock, istStartLabel } from '@repo/core/booking-requests';
import {
  BOOKING_TYPE_LABELS,
  bookingTypeParam,
  noticeSentence,
  offeredBookingTypes,
  parseBookingType,
  resolveBookingType,
} from '@repo/core/booking-types';
import { formatClock } from '@repo/core/format';
import { GUARANTEE_BADGE } from '@repo/core/guarantee';
import { useNow } from '@repo/core/hooks/use-now';
import { fill, msg, useT, useTn } from '@repo/core/i18n';
import { confirmPayment, intentPollResult, realClock } from '@repo/core/payment-confirmation';
import { insidePickupReach, PICKUP_RESPONSIBILITY_LINE, pickupFeeLabel } from '@repo/core/pickup';
import { usePickupFeeConfig } from '@repo/core/api/hooks/use-pickup-fee';
import { CONVENIENCE_FEE_LABEL, PICKUP_FEE_FULL_LINE, PICKUP_FEE_REFUND_LINE, pickupLineLabel } from '@repo/core/pickup-fee';
import { addressPickupFee } from '@repo/core/pickup-fee-customer';
import { isNoFeeInspection, resolveServiceAmount } from '@repo/core/pricing';
import { checkoutAgreement } from '@repo/core/inspection-booking';
import { googleRatingSpoken, hasStarScore, mainGoogleRating } from '@repo/core/ratings';
import { DetlioMark, GoogleMapsText, GoogleMark } from '@repo/native-ui/rating-marks';
import { rewardRupees } from '@repo/core/rewards';
import { knownDurationTotal } from '@repo/core/service-duration';
import { isLastingRefusal, livePendingCheckout, pendingCodeFor } from '@repo/core/stores/pending-checkout-store';
import { useUserStore } from '@repo/core/stores/user-store';
import type { Address, BookingType, Service, Vendor } from '@repo/core/types';
import { formatDuration } from '@repo/core/utils';
import { VEHICLE_TIERS } from '@repo/core/vehicles';
import { Label, ScButton } from '@repo/native-ui/button';
import { AddOnMark, ScSwitch } from '@repo/native-ui/chip';
import {
  IconAlertCircle,
  IconArrowUpRight,
  IconCheck,
  IconChevronRight,
  IconLock,
  IconMapPin,
  IconPercentage,
  IconPlus,
  IconRefresh,
  IconShieldCheck,
  IconX,
} from '@repo/native-ui/icons';
import { ErrorState, HubCard, Notice, Spinner } from '@repo/native-ui/primitives';
import { ScInput } from '@repo/native-ui/inputs';
import { ConfirmSheet, ScSheet } from '@repo/native-ui/sheet';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { Glass, RedButton } from '@repo/native-ui/finish';
import { EASE_SPRING, useOneShot, useReduceMotion } from '@repo/native-ui/motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { type ComponentRef, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LEGAL_PATHS } from '@/lib/help-legal';
import { PageHeader as Header } from '@/components/page-header';
import { AddAddressSheet } from '@/components/checkout/add-address-sheet';
import { CheckoutAddOns } from '@/components/checkout/checkout-add-ons';
import { CouponScanner } from '@/components/coupons/coupon-scanner';
import { GuestCarForm } from '@/components/checkout/guest-car';
import { PaymentReceivedPanel } from '@/components/checkout/payment-received-panel';
import { CheckoutSignInCard, useCheckoutSignIn } from '@/components/checkout/sign-in';
import { PickButton } from '@/components/checkout/pick-button';
import { WhenPicker } from '@/components/checkout/when-picker';
import { ModeSwitch } from '@/components/garage/mode-switch';
import { NumberPlate } from '@/components/moments/number-plate';
import { TierMark } from '@/components/garage/tier';
import { OutsideCityLine } from '@/components/garage/tier';
import { useGarageTownLine } from '@/lib/customer-place';
import { AddCarSheet } from '@/components/home/add-car-sheet';
import { LocationPicker, type PickedLocation } from '@/components/location-picker';
import { SlotAlertAsk } from '@/components/slot-alerts/slot-alert-ask';
import { getVendorAddOns } from '@/lib/add-ons';
import { useAuth } from '@/lib/auth';
import { bookingCarId } from '@/lib/booking-car';
import { linkedCarId } from '@repo/core/rescue';
import {
  clearBookingDraft,
  type DraftAddress,
  type DraftCar,
  draftCarReady,
  draftSlotStillAhead,
  readBookingDraft,
  writeBookingDraft,
} from '@/lib/booking-draft';
import { openCheckout } from '@/lib/checkout';
import { checkoutCreditSplit, confirmOrderTotal, couponsForCheckout, guaranteeCovers } from '@/lib/checkout-maths';
import { errorText } from '@/lib/error-text';
import { usePendingCheckout } from '@/lib/pending-checkout';
import { checkPending, pendingKey, type PendingPayment, pendingPayment, setPaymentFlowOnScreen } from '@/lib/pending-payment';
import { money, serviceApproxNote, servicePriceText } from '@/lib/price';
import { track } from '@/lib/shims/analytics';
import { istDay, linkedSlot } from '@/lib/when-picker';

type CheckoutStep = 'slot' | 'car' | 'address' | 'pin' | 'outside' | 'unpriced' | 'signin' | 'name';

const DRAFT_CAR = 'draft-car';
const DRAFT_ADDRESS = 'draft-address';

const BOOKED_AS: Record<BookingType, string> = {
  dropin: msg('at the garage'),
  doorstep: msg('a doorstep visit'),
  pickup: msg('pickup & drop'),
};

/** The solid red Pay arriving: one small pop (bk-cta-pop), none under Reduce Motion. */
function CtaPop({ children }: { children: ReactNode }) {
  const p = useOneShot({ duration: 500, easing: EASE_SPRING });
  return (
    <Animated.View style={{ transform: [{ scale: p.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0.96, 1.03, 1] }) }] }}>
      {children}
    </Animated.View>
  );
}

/** apps/users/app/book/[vendorId]/page.tsx. Prices come from the server; what's charged is the server's sum. */
export default function BookScreen() {
  const tn = useTn();
  const t = useT();
  const params = useLocalSearchParams<{
    vendorId: string;
    service?: string;
    addons?: string;
    mode?: string;
    address?: string;
    code?: string;
    date?: string;
    request?: string;
    slot?: string;
    /** The rescue's booked car (other-garages-card.tsx): its "Same job" price was for this car. */
    car?: string;
  }>();
  const vendorId = String(params.vendorId);
  const serviceIdsParam = params.service ?? null;
  const addOnIdsParam = params.addons ?? null;
  const modeParam = params.mode ?? null;
  const addressParam = params.address ?? null;
  const codeParam = params.code?.trim().toUpperCase() || null;
  const dateParam = params.date ?? null;
  const requestParam = params.request ?? null;
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { fx } = useFinish();
  const promiseGreen = colors.scheme === 'light' ? colors.success : '#4ADE80';

  const authUser = useAuth((s) => s.user);
  const isGuest = !authUser;
  const myRequest = useMyRequest(requestParam && authUser ? requestParam : null);
  const acceptedRequest =
    myRequest.data && myRequest.data.state === 'accepted' && myRequest.data.garage.id === vendorId ? myRequest.data : null;
  const requestMode = acceptedRequest !== null;
  const travelFee = acceptedRequest?.travelFee ?? 0;

  const [restored] = useState(() => {
    const draft = readBookingDraft();
    return draft && draft.vendorId === vendorId ? draft : null;
  });
  const [draftCar, setDraftCar] = useState<DraftCar | null>(() => restored?.car ?? null);
  const [draftAddress, setDraftAddress] = useState<DraftAddress | null>(() => restored?.address ?? null);
  const [keepsDraft] = useState(() => isGuest || restored !== null);

  const vehicles = useUserStore((s) => s.vehicles);
  const addresses = useUserStore((s) => s.addresses);
  const profile = useUserStore((s) => s.profile);
  const fetchVehicles = useUserStore((s) => s.fetchVehicles);
  const fetchAddresses = useUserStore((s) => s.fetchAddresses);
  const fetchProfile = useUserStore((s) => s.fetchProfile);

  const [vendor, setVendor] = useState<Vendor | null>(null);
  // The garage page's line once more above Pay, only for a garage outside the customer's city (0070).
  const townLine = useGarageTownLine(vendor);
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [categoryById, setCategoryById] = useState<Record<string, string>>({});
  const guaranteeOn = useGuaranteeConfig().data?.enabled === true;
  const [servicesDropped, setServicesDropped] = useState(false);
  const [loadProblem, setLoadProblem] = useState<'gone' | 'failed' | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  // A time picked on a garage card's Next free row: the booking opens on its day with it
  // chosen while it is still ahead, and lets it go with a word if it has been taken.
  // Read once, on arrival, like the draft; the card's time wins, being the newer choice.
  const [linked] = useState(() => linkedSlot(params.slot, Date.now()));
  const [pickedSlot, setSelectedSlot] = useState<string | null>(() => linked ?? draftSlotStillAhead(restored?.slot ?? null, Date.now()));
  const selectedSlot = acceptedRequest?.acceptedStartAt ?? pickedSlot;
  const [restoredDay] = useState(() => (selectedSlot ? istDay(selectedSlot) : null));

  const queryClient = useQueryClient();
  const [pickedVehicle, setPickedVehicle] = useState<string | null>(null);
  const [pickedAddress, setPickedAddress] = useState<string | null>(null);
  const [pinningAddress, setPinningAddress] = useState(false);
  const [refusedAddressIds, setRefusedAddressIds] = useState<string[]>([]);
  const [chosenType, setChosenType] = useState<BookingType | null>(() => parseBookingType(modeParam));
  const [loading, setLoading] = useState(false);
  const bookingLockRef = useRef(false);
  const paidRef = useRef(false);
  const [paid, setPaid] = useState<{ paymentId: string; phase: 'confirming' | 'unconfirmed' | 'failed'; refundMessage?: string } | null>(null);
  /** A payment from before, not yet settled: stops a second one until it's known. */
  const [unsettled, setUnsettled] = useState(false);
  const [totalCheck, setTotalCheck] = useState<{ rupees: number; resolve: (agreed: boolean) => void } | null>(null);

  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const stepY = useRef<Partial<Record<'slot' | 'car' | 'address' | 'summary' | 'signin', number>>>({});
  // The step the grey button named: scrolled to, it nudges once (§6, bk-nudge).
  const nudge = useRef(new Animated.Value(0)).current;
  const [nudged, setNudged] = useState<'slot' | 'car' | 'address' | 'summary' | 'signin' | null>(null);
  const mark = (step: 'slot' | 'car' | 'address' | 'summary' | 'signin') => ({
    onLayout: (e: { nativeEvent: { layout: { y: number } } }) => {
      stepY.current[step] = e.nativeEvent.layout.y;
    },
    style:
      nudged === step
        ? { transform: [{ translateX: nudge.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -5, 5, -5, 5, 0] }) }] }
        : undefined,
  });

  const [promoInput, setPromoInput] = useState('');
  const [promoOpen, setPromoOpen] = useState(false);
  const [addCarOpen, setAddCarOpen] = useState(false);
  const [addAddressOpen, setAddAddressOpen] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<{ discount: AppliedDiscount; serviceKey: string; vehicleId: string } | null>(null);
  const applyPromo = useValidateDiscount();
  const [creditSwitchOn, setCreditSwitchOn] = useState(true);
  const signIn = useCheckoutSignIn();
  const [signInOpen, setSignInOpen] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [signedInHere, setSignedInHere] = useState(false);
  const [profileName, setProfileName] = useState('');
  const savedDraftCarId = useRef<string | null>(null);
  const savedDraftAddressId = useRef<string | null>(null);
  const savingDraftRef = useRef(false);
  const finishingSignInRef = useRef(false);
  const [finishingSignIn, setFinishingSignIn] = useState(false);

  const userId = authUser?.id;
  const giftsConfig = useGiftsConfig();
  const giftsOn = giftsEnabled(giftsConfig.data);
  const myCredit = useMyCredit(giftsOn && !!userId);
  const rewardsConfig = useRewardsConfig();
  const rewardsSummary = useRewardsSummary(rewardsEnabled(rewardsConfig.data) && !!userId);
  const rewardVouchers = (rewardsSummary.data?.vouchers ?? []).filter((v) => v.code);
  const myCoupons = couponsForCheckout(useMyCoupons(!!userId).data);
  const freeWashes = (useAreaStatus({ enabled: !!userId }).data?.signups ?? [])
    .map((signup) => (signup.freeWashReady ? { area: signup.zone.name, ...signup.freeWashReady } : null))
    .filter((wash): wash is { area: string; code: string; amount: number; endsAt: string } => wash !== null);

  const pending = usePendingCheckout((s) => s.pending);
  const forgetPendingCode = usePendingCheckout((s) => s.forgetCode);
  const clearPending = usePendingCheckout((s) => s.clear);
  const now = useNow();
  const livePending = livePendingCheckout(pending, { userId, now });
  const [offerDropped, setOfferDropped] = useState(false);
  const [refusedOffer, setRefusedOffer] = useState<string | null>(null);
  const offerCode = offerDropped ? null : (codeParam ?? pendingCodeFor(livePending, vendorId) ?? refusedOffer);
  const offerCheckedFor = useRef<string | null>(null);

  // A server without the route (404) has none: no section at all.
  const addOnsQuery = useQuery({ queryKey: ['vendor-add-ons', vendorId], queryFn: () => getVendorAddOns(vendorId) });
  const garageAddOns: AddOn[] = addOnsQuery.data ?? [];
  const [pickedAddOnIds, setPickedAddOnIds] = useState<string[]>(
    () => (addOnIdsParam?.split(',') ?? restored?.addOnIds ?? []).filter(Boolean)
  );

  useEffect(() => {
    let cancelled = false;
    queryClient.fetchQuery(garageQuery(vendorId)).then(
      (garage) => {
        if (cancelled) return;
        if (garage === null) {
          setVendor(null);
          setLoadProblem('gone');
          return;
        }
        setVendor(garage.vendor);
        setCategoryById(Object.fromEntries(garage.services.map((service) => [service.id, service.category])));
        const catalogue: Service[] = [...garage.services, ...garage.packages];
        const { requested, picked } = pickRequestedServices(serviceIdsParam, catalogue);
        if (requested.length > 0 && picked.length === 0) {
          const next = new URLSearchParams({ withdrawn: '1' });
          const mode = parseBookingType(modeParam);
          const modeQuery = mode ? bookingTypeParam(mode) : null;
          if (modeQuery) next.set('mode', modeQuery);
          router.replace(`/garage/${vendorId}?${next.toString()}` as Href);
          return;
        }
        setServicesDropped(picked.length < requested.length);
        setSelectedServices(picked.length > 0 ? picked : garage.services.slice(0, 1));
      },
      (error: unknown) => {
        if (cancelled) return;
        setLoadProblem(error instanceof ApiError && error.status === 404 ? 'gone' : 'failed');
      }
    );
    return () => {
      cancelled = true;
    };
  }, [vendorId, serviceIdsParam, modeParam, loadAttempt, queryClient]);

  const signedIn = !isGuest;
  useEffect(() => {
    if (!signedIn) return;
    void fetchVehicles().catch(() => undefined);
    void fetchAddresses().catch(() => undefined);
    void fetchProfile().catch(() => undefined);
  }, [signedIn, fetchVehicles, fetchAddresses, fetchProfile]);

  const carDraftReady = draftCarReady(draftCar);
  const selectedVehicle = isGuest
    ? carDraftReady
      ? DRAFT_CAR
      : null
    : (acceptedRequest?.vehicleId ?? pickedVehicle ?? linkedCarId(vehicles, params.car) ?? (carDraftReady ? DRAFT_CAR : bookingCarId(vehicles, livePending?.vehicleId)));
  const savedVehicleId = selectedVehicle === DRAFT_CAR ? null : selectedVehicle;
  const selectedVehicleRecord = vehicles.find((v) => v.id === savedVehicleId);
  const selectedVehicleLabel = selectedVehicleRecord ? `${selectedVehicleRecord.make} ${selectedVehicleRecord.model}`.trim() : null;
  // Ask for pickup (0079) may be a yes from a garage that doesn't list pickup: the yes is the mode.
  const bookingType = acceptedRequest ? acceptedRequest.bookingType : resolveBookingType(chosenType, vendor);
  const modeWithdrawn = requestMode ? null : unofferedMode(chosenType, vendor);
  const modeOptions = vendor ? offeredBookingTypes(vendor).map((value) => ({ value, label: BOOKING_TYPE_LABELS[value] })) : [];
  const checkoutSeen = useRef(false);
  useEffect(() => {
    if (checkoutSeen.current || !vendor || selectedServices.length === 0) return;
    checkoutSeen.current = true;
    track('checkout_start', { vendorId, mode: bookingType, serviceCount: selectedServices.length });
  }, [vendor, vendorId, bookingType, selectedServices.length]);
  const pickSlot = useCallback(
    (scheduledAt: string | null) => {
      setSelectedSlot(scheduledAt);
      if (scheduledAt) track('slot_select', { vendorId, mode: bookingType });
    },
    [vendorId, bookingType]
  );
  const pickAddress = (addressId: string) => {
    setPickedAddress(addressId);
    track('address_select', { vendorId, mode: bookingType });
  };

  const isPickup = bookingType === 'pickup';
  const usesAddress = bookingType === 'doorstep' || isPickup;
  const linkedAddress = addresses.some((a) => a.id === addressParam) ? addressParam : null;
  const draftAddressRecord: Address | null = draftAddress
    ? { id: DRAFT_ADDRESS, label: draftAddress.label, address: draftAddress.address, pincode: '', lat: draftAddress.lat, lng: draftAddress.lng, isDefault: false }
    : null;
  const selectedAddress = !usesAddress
    ? null
    : isGuest
      ? draftAddress
        ? DRAFT_ADDRESS
        : null
      : (acceptedRequest?.addressId ??
        pickedAddress ??
        (draftAddress ? DRAFT_ADDRESS : null) ??
        linkedAddress ??
        addresses.find((a) => a.isDefault)?.id ??
        (addresses.length === 1 ? addresses[0].id : null));
  const selectedAddressRecord = selectedAddress === DRAFT_ADDRESS ? draftAddressRecord : (addresses.find((a) => a.id === selectedAddress) ?? null);
  const addressOptions: Address[] = [...(draftAddressRecord ? [draftAddressRecord] : []), ...(isGuest ? [] : addresses)];
  const addressNeedsPin =
    selectedAddressRecord != null &&
    (selectedAddressRecord.lat == null || selectedAddressRecord.lng == null || (selectedAddressRecord.lat === 0 && selectedAddressRecord.lng === 0));
  const outsidePickup = (address: Address) =>
    isPickup &&
    vendor != null &&
    (refusedAddressIds.includes(address.id) || (!(address.lat === 0 && address.lng === 0) && insidePickupReach(vendor, address) === false));
  const addressOutside = !requestMode && selectedAddressRecord != null && !addressNeedsPin && outsidePickup(selectedAddressRecord);
  const otherMode = vendor ? (offeredBookingTypes(vendor).find((type) => type !== 'pickup') ?? null) : null;
  const outsideAdvice = otherMode
    ? t("This garage doesn't pick up from this address. Try another address or choose {mode}.", { mode: t(BOOKING_TYPE_LABELS[otherMode]) })
    : t("This garage doesn't pick up from this address. Try another address.");
  const addressBlocker: 'address' | 'pin' | 'outside' | null = !usesAddress
    ? null
    : selectedAddress == null
      ? 'address'
      : addressNeedsPin
        ? 'pin'
        : addressOutside
          ? 'outside'
          : null;
  const addressReady = addressBlocker === null;

  // A request confirms exactly what the garage accepted: no add-ons.
  const pickedAddOns = requestMode ? [] : garageAddOns.filter((addOn) => pickedAddOnIds.includes(addOn.id));
  // Add-on lines travel in serviceIds, services first: price, code and slot checks read the whole job.
  const serviceIds = [...selectedServices.map((service) => service.id), ...pickedAddOns.map((addOn) => addOn.id)];
  const serviceKey = serviceIds.join(',');
  const appliedDiscount =
    appliedPromo && appliedPromo.serviceKey === serviceKey && appliedPromo.vehicleId === selectedVehicle ? appliedPromo.discount : null;
  const appliedReward = appliedDiscount ? rewardVouchers.find((v) => v.code?.toUpperCase() === appliedDiscount.code.toUpperCase()) : undefined;
  const appliedCoupon = appliedDiscount ? myCoupons.find((c) => c.code.toUpperCase() === appliedDiscount.code.toUpperCase()) : undefined;
  const selectedVehicleType =
    isGuest || selectedVehicle === DRAFT_CAR ? draftCar?.vehicleType : vehicles.find((v) => v.id === selectedVehicle)?.vehicleType;
  const vehicleTierLabel = VEHICLE_TIERS.find((tier) => tier.value === selectedVehicleType)?.label;
  const lines = [...selectedServices, ...pickedAddOns].map((service) => ({
    service: service as Service,
    amount: resolveServiceAmount(service as Service, selectedVehicleType),
  }));
  const lineCount = lines.length;
  const bookingSummary = jobSummary([...selectedServices, ...pickedAddOns.map((addOn) => ({ name: addOn.name, isAddon: true }))]);
  const unpricedLines = selectedVehicleType != null ? lines.filter((line) => line.amount == null) : [];
  const unpricedForVehicle = unpricedLines.length > 0;
  const needsName = !isGuest && authUser?.name === 'User';

  const nextStep: CheckoutStep | null = !selectedSlot
    ? 'slot'
    : !selectedVehicle
      ? 'car'
      : (addressBlocker ?? (unpricedForVehicle ? 'unpriced' : isGuest ? 'signin' : needsName && profileName.trim().length === 0 ? 'name' : null));

  const stepLabels: Record<CheckoutStep, string> = {
    slot: t('Pick a time'),
    car: vehicles.length === 0 ? t('Add your car') : t('Choose your car'),
    address: addressOptions.length === 0 ? t('Add your address') : t('Choose an address'),
    pin: t('Pin your address on the map'),
    outside: t('Choose another address'),
    unpriced: t('Remove the unpriced service'),
    signin: signIn.phase === 'phone' ? t('Enter your number to pay') : signIn.readyToVerify ? t('Tap Verify and pay above') : t('Enter the code we sent'),
    name: t('Add your name'),
  };

  const goToStep = (step: CheckoutStep) => {
    const target = { slot: 'slot', car: 'car', address: 'address', pin: 'address', outside: 'address', unpriced: 'summary', signin: 'signin', name: 'signin' } as const;
    const y = stepY.current[target[step]];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: !reduceMotion });
    if (reduceMotion) return;
    setNudged(target[step]);
    nudge.setValue(0);
    Animated.timing(nudge, { toValue: 1, duration: 500, delay: 250, easing: Easing.bezier(0.36, 0.07, 0.19, 0.97), useNativeDriver: true }).start();
  };

  const handleSlotTaken = useCallback(() => {
    if (paidRef.current || bookingLockRef.current) return;
    toast.info(t('That time was just taken; pick another.'));
  }, []);

  const handleSlotLapse = (scheduledAt: string) => {
    toast.info(t('{time} is now too soon to book. {notice} Pick another time.', { time: formatClock(scheduledAt), notice: noticeSentence(bookingType) }));
    goToStep('slot');
  };

  const subtotal = unpricedForVehicle ? null : lines.reduce((total, line) => total + Math.round((line.amount ?? 0) * 100), 0) / 100;
  // On inspection with no fee (0073), and nothing else priced: nothing to pay now. The server
  // books it with no payment and refuses a code on it, so no code is offered or sent (as the web).
  const nothingPriced = subtotal === 0 && selectedServices.some(isNoFeeInspection);
  // The pickup fee (0079) for the address, with the server's own maths (web checkout); an accepted
  // request's fee is its travelFee. Detlio's convenience fee only while above ₹0, never on a ₹0 booking.
  const pickupTrip =
    isPickup && !requestMode && vendor && selectedAddressRecord && !addressNeedsPin
      ? addressPickupFee(vendor.pickupFee, vendor, selectedAddressRecord, subtotal)
      : null;
  const pickupFee = isPickup ? (requestMode ? travelFee : (pickupTrip?.fee ?? 0)) : 0;
  const pickupRoadKm = requestMode ? (acceptedRequest?.roadKm ?? null) : (pickupTrip?.roadKm ?? null);
  const pickupFeeConfig = usePickupFeeConfig();
  const servicesCharge = appliedDiscount ? Number(appliedDiscount.finalAmount) : subtotal;
  const convenienceFee =
    servicesCharge != null && servicesCharge + travelFee + (requestMode ? 0 : pickupFee) > 0 ? (pickupFeeConfig.data?.convenienceFee ?? 0) : 0;
  const fees = travelFee + (requestMode ? 0 : pickupFee) + convenienceFee;
  const payableAmount = appliedDiscount
    ? Math.round((Number(appliedDiscount.finalAmount) + fees) * 100) / 100
    : subtotal == null
      ? null
      : Math.round((subtotal + fees) * 100) / 100;
  const creditBalance = giftsOn ? Number(myCredit.data?.balance ?? 0) : 0;
  const creditSplit = creditBalance > 0 && payableAmount != null && payableAmount > 0 ? checkoutCreditSplit(payableAmount, creditBalance) : null;
  const creditOffered = creditSplit !== null && creditSplit.credit > 0;
  const creditApplied = creditOffered && creditSwitchOn;
  const toPay = creditApplied ? creditSplit.toPay : payableAmount;
  const freeBooking = toPay === 0 && !creditApplied;
  // …and a no-fee inspection, booked the same way: "Pay after inspection".
  const inspectionBooking = freeBooking && nothingPriced;
  const servicesDuration = knownDurationTotal(selectedServices);
  const totalDuration = servicesDuration === null ? null : pickedAddOns.reduce((total, addOn) => total + addOn.extraMins, servicesDuration);

  const canApplyPromo = promoInput.trim().length >= 3 && selectedServices.length > 0 && savedVehicleId != null && !unpricedForVehicle && !nothingPriced;

  const handleApplyReward = (code: string) => {
    if (selectedServices.length === 0 || savedVehicleId == null || unpricedForVehicle || nothingPriced || applyPromo.isPending) return;
    const vehicleId = savedVehicleId;
    applyPromo.mutate(
      { code, vendorId, serviceIds, vehicleId },
      {
        onSuccess: (applied) => {
          setAppliedPromo({ discount: applied, serviceKey, vehicleId });
          if (offerCode && applied.code !== offerCode) setOfferDropped(true);
        },
        onError: (error) => {
          setAppliedPromo(null);
          toast.error(errorText(error, t("This can't be used on this booking.")));
        },
      }
    );
  };

  const handleApplyPromo = () => {
    if (!canApplyPromo || applyPromo.isPending) return;
    const vehicleId = savedVehicleId!;
    applyPromo.mutate(
      { code: promoInput.trim(), vendorId, serviceIds, vehicleId },
      {
        onSuccess: (applied) => {
          setAppliedPromo({ discount: applied, serviceKey, vehicleId });
          setPromoOpen(false);
          if (offerCode && applied.code !== offerCode) setOfferDropped(true);
        },
        onError: () => setAppliedPromo(null),
      }
    );
  };

  const offerCheckKey = offerCode && selectedServices.length > 0 && savedVehicleId && !unpricedForVehicle && !nothingPriced ? `${offerCode}|${serviceKey}|${savedVehicleId}` : null;
  useEffect(() => {
    if (!offerCode || !offerCheckKey || !savedVehicleId) return;
    if (offerCheckedFor.current === offerCheckKey) return;
    offerCheckedFor.current = offerCheckKey;
    const vehicleId = savedVehicleId;
    const key = serviceKey;
    const code = offerCode;
    applyPromo.mutate(
      { code, vendorId, serviceIds, vehicleId },
      {
        onSuccess: (applied) => setAppliedPromo({ discount: applied, serviceKey: key, vehicleId }),
        onError: (error) => {
          setAppliedPromo(null);
          if (error instanceof ApiError && isLastingRefusal(error.code)) {
            setRefusedOffer(code);
            forgetPendingCode();
          }
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerCheckKey, offerCode, savedVehicleId, vendorId]);

  const bestVoucher = rewardVouchers.reduce<(typeof rewardVouchers)[number] | null>(
    (best, voucher) => (!best || Number(voucher.amount) > Number(best.amount) ? voucher : best),
    null
  );
  const [suggestionDropped, setSuggestionDropped] = useState(false);
  const [suggestedCode, setSuggestedCode] = useState<string | null>(null);
  const suggestionCheckedFor = useRef<string | null>(null);
  const suggestionKey =
    bestVoucher?.code && !offerCode && !suggestionDropped && !appliedDiscount && selectedServices.length > 0 && savedVehicleId && !unpricedForVehicle && !nothingPriced
      ? `${bestVoucher.code}|${serviceKey}|${savedVehicleId}`
      : null;
  useEffect(() => {
    if (!suggestionKey || !bestVoucher?.code || !savedVehicleId || applyPromo.isPending) return;
    if (suggestionCheckedFor.current === suggestionKey) return;
    suggestionCheckedFor.current = suggestionKey;
    const vehicleId = savedVehicleId;
    const key = serviceKey;
    applyPromo.mutate(
      { code: bestVoucher.code, vendorId, serviceIds, vehicleId },
      {
        onSuccess: (applied) => {
          setAppliedPromo({ discount: applied, serviceKey: key, vehicleId });
          setSuggestedCode(applied.code);
        },
        onError: () => applyPromo.reset(),
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestionKey, applyPromo.isPending]);

  // An add-on's line comes off here too. The cross on a service counts services only;
  // checkout can't hold add-ons alone.
  const removeService = (serviceId: string) => {
    if (pickedAddOnIds.includes(serviceId)) {
      setPickedAddOnIds((current) => current.filter((id) => id !== serviceId));
      return;
    }
    const left = selectedServices.filter((service) => service.id !== serviceId);
    if (selectedServices.length <= 1) return;
    setSelectedServices(left);
    setPickedAddOnIds((current) => addOnsAfterRemoving(current, left.length));
  };
  const toggleAddOn = (addOnId: string) =>
    setPickedAddOnIds((current) => (current.includes(addOnId) ? current.filter((id) => id !== addOnId) : [...current, addOnId]));

  // A printed coupon goes into the account first; what comes back is the code that applies.
  const [scanning, setScanning] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const addScanned = async (scanned: string) => {
    setScanBusy(true);
    try {
      const { coupon } = await redeemCoupon(scanned, 'camera');
      track('coupon_redeem', { source: 'camera' });
      void invalidateCoupons(queryClient);
      setPromoOpen(false);
      if (coupon?.code) handleApplyReward(coupon.code);
    } catch (error) {
      toast.error(errorText(error, t("Couldn't add that coupon. Check your connection and try again.")));
    } finally {
      setScanBusy(false);
    }
  };

  const handleRemovePromo = () => {
    setSuggestionDropped(true);
    setSuggestedCode(null);
    if (offerCode) {
      setOfferDropped(true);
      forgetPendingCode();
    }
    setAppliedPromo(null);
    setPromoInput('');
    applyPromo.reset();
    setPromoOpen(false);
  };

  const promoError =
    applyPromo.error && applyPromo.variables?.serviceIds.join(',') === serviceKey && applyPromo.variables?.vehicleId === selectedVehicle
      ? errorMessage(applyPromo.error, t("This code isn't valid."))
      : '';
  const offerChecking = !!offerCode && applyPromo.isPending && applyPromo.variables?.code === offerCode;
  const offerProblem = offerCode && !appliedDiscount && !offerChecking && applyPromo.variables?.code === offerCode ? promoError : '';

  const handlePinAddress = async (picked: PickedLocation) => {
    if (!selectedAddress) return;
    setPinningAddress(true);
    try {
      const saved = await updateAddress(selectedAddress, { lat: picked.lat, lng: picked.lng, geoSource: picked.source });
      useUserStore.setState((state) => ({ addresses: state.addresses.map((a) => (a.id === saved.id ? saved : a)) }));
      toast.success(t('Location saved'));
    } catch (err) {
      toast.error(errorText(err, t('Could not save that location')));
    } finally {
      setPinningAddress(false);
    }
  };

  const afterBooked = (bookingId: string) => {
    void invalidateHome(queryClient);
    void invalidateGiftData(queryClient);
    void invalidateRewards(queryClient);
    void invalidateCoupons(queryClient);
    clearPending();
    clearBookingDraft();
    router.replace(`/bookings/${bookingId}?celebrate=1` as Href);
  };

  /** Never a second payment over one that might still settle. */
  const lastPaymentClear = async (): Promise<boolean> => {
    for (const last of pendingPayment.list()) {
      if (last.kind !== 'intent') continue;
      const outcome = await checkPending(last);
      if (outcome.kind === 'checking') {
        setUnsettled(true);
        return false;
      }
      if (outcome.kind === 'booked') {
        afterBooked(outcome.bookingId);
        return false;
      }
      if (outcome.kind === 'failed') toast.error(outcome.message);
    }
    return true;
  };

  const handleConfirm = async (chosen?: {
    vehicleId: string;
    addressId: string | null;
    discountCode?: string;
    customer?: { name?: string; phone?: string };
  }) => {
    if (paidRef.current || bookingLockRef.current || loading) return;
    if (applyPromo.isPending) return;
    const vehicleId = chosen?.vehicleId ?? savedVehicleId;
    const addressId = chosen ? chosen.addressId : selectedAddress;
    // Nothing priced (a no-fee inspection, 0073): no code to send.
    const discountCode = nothingPriced ? undefined : chosen ? chosen.discountCode : appliedDiscount?.code;
    if (selectedServices.length === 0 || !selectedSlot || !vehicleId) return;
    if (!addressReady) return;
    bookingLockRef.current = true;
    setLoading(true);
    setPaymentFlowOnScreen(true);
    track('pay_click', { vendorId, mode: bookingType, serviceCount: selectedServices.length, amountBucket: payableAmount === null ? undefined : amountBucket(payableAmount) });
    try {
      if (!(await lastPaymentClear())) return;
      const order = await createBookingIntent({
        vendorId,
        serviceIds,
        scheduledAt: selectedSlot,
        bookingType,
        vehicleId,
        paymentMethod: 'online',
        addressId: addressId ?? undefined,
        discountCode,
        useCredit: giftsOn ? creditApplied : undefined,
        requestId: acceptedRequest?.id,
        // The pickup fee this screen shows (0079): the server refuses, before
        // any charge, if the garage's fee changed since.
        pickupFee: pickupTrip ? pickupTrip.fee : undefined,
      });
      if ((order.paidWithCredit || order.free) && order.bookingId) {
        paidRef.current = true;
        track('pay_success', { vendorId, mode: bookingType, serviceCount: selectedServices.length });
        afterBooked(order.bookingId);
        return;
      }
      if (!order.orderId) throw new Error(t('Could not start the payment. Please try again.'));
      // The server's figure is what's charged: a different one is shown before Razorpay opens.
      const agreed = await confirmOrderTotal(order.amount, toPay, (rupees) => new Promise((resolve) => setTotalCheck({ rupees, resolve })));
      if (!agreed) {
        toast.info(t('Nothing was booked or charged.'));
        return;
      }
      // Written before the window opens: if the app dies in it, the webhook settles and this finds out.
      const record: PendingPayment = { kind: 'intent', intentId: order.intentId, vendorName: vendor?.name ?? '', startedAt: Date.now() };
      pendingPayment.write(record);
      const payKey = pendingKey(record);
      const result = await openCheckout(
        { orderId: order.orderId, amount: order.amount, currency: order.currency, keyId: order.keyId ?? '' },
        {
          description: `${bookingSummary} at ${vendor?.name ?? 'the garage'}`,
          name: chosen?.customer?.name ?? profile?.name,
          phone: chosen?.customer?.phone ?? profile?.phone,
        }
      );
      if (result.kind === 'cancelled') {
        pendingPayment.clear(payKey);
        toast.info(t('Payment cancelled. Nothing was booked.'));
        return;
      }
      if (result.kind === 'failed') {
        pendingPayment.clear(payKey);
        track('pay_failed', { vendorId, mode: bookingType });
        toast.error(result.message);
        return;
      }
      paidRef.current = true;
      setPaid({ paymentId: result.paymentId, phase: 'confirming' });
      const outcome = await confirmPayment({
        // No marketing data from the app, ever.
        verify: () =>
          verifyPayment({
            intentId: order.intentId,
            razorpayOrderId: result.orderId,
            razorpayPaymentId: result.paymentId,
            razorpaySignature: result.signature,
          }),
        poll: async () => intentPollResult(await getBookingIntentStatus(order.intentId)),
        ...realClock,
      });
      if (outcome.kind === 'booked') {
        pendingPayment.clear(payKey);
        track('pay_success', { vendorId, mode: bookingType, serviceCount: selectedServices.length, amountBucket: amountBucket(order.amount / 100) });
        afterBooked(outcome.bookingId);
      } else if (outcome.kind === 'failed') {
        pendingPayment.clear(payKey);
        track('pay_failed', { vendorId, mode: bookingType });
        void invalidateHome(queryClient);
        setPaid({ paymentId: result.paymentId, phase: 'failed', refundMessage: outcome.message });
      } else {
        // Kept: the next return to the app reads the real outcome.
        setPaid({ paymentId: result.paymentId, phase: 'unconfirmed' });
      }
    } catch (error) {
      if (error instanceof ApiError && error.code?.startsWith('DISCOUNT_')) {
        setAppliedPromo(null);
        toast.error(error.message);
      } else if (
        error instanceof ApiError &&
        (error.code === 'SLOT_TOO_SOON' || error.code === 'INVALID_SCHEDULED_AT' || error.code === 'SLOT_FULL' || error.code === 'GARAGE_CLOSED_THAT_DAY')
      ) {
        setSelectedSlot(null);
        void queryClient.invalidateQueries({ queryKey: slotKeys.all });
        toast.error(
          error.code === 'SLOT_TOO_SOON' && isPickup
            ? t('That time is too soon now. {notice} Pick a later time.', { notice: noticeSentence('pickup') })
            : error.code === 'SLOT_FULL'
              ? t('That time was just taken; pick another.')
              : error.message
        );
        goToStep('slot');
      } else if (error instanceof ApiError && error.code === 'PICKUP_FEE_CHANGED') {
        // The garage's pickup fee changed since this screen loaded (0079): nothing was charged.
        // Fetch the garage again so the lines and the total show the new fee before paying.
        toast.error(error.message);
        void getVendor(vendorId).then((v) => v && setVendor(v));
      } else if (error instanceof ApiError && error.code === 'PICKUP_NOT_OFFERED') {
        toast.error(
          otherMode
            ? t('This garage has stopped offering pickup & drop. You can book {mode} instead, or pick another garage.', { mode: t(BOOKED_AS[otherMode]) })
            : t('This garage has stopped offering pickup & drop. Pick another garage.')
        );
        void getVendor(vendorId).then((v) => v && setVendor(v));
      } else if (error instanceof ApiError && error.code === 'OUTSIDE_PICKUP_RADIUS') {
        if (addressId) setRefusedAddressIds((current) => [...new Set([...current, addressId])]);
        toast.error(outsideAdvice);
        goToStep('address');
      } else if (error instanceof ApiError && error.code === 'ADDRESS_REQUIRED') {
        toast.error(isPickup ? t('Choose the address we should collect your car from.') : t('Choose the address we should come to.'));
        goToStep('address');
      } else if (error instanceof ApiError && error.code === 'ADDRESS_LOCATION_REQUIRED') {
        toast.error(isPickup ? t('Pin your address on the map so the garage can find your car.') : t('Pin your address on the map so the garage can find you.'));
        void getAddresses()
          .then((fresh) => {
            useUserStore.setState({ addresses: fresh });
            goToStep('pin');
          })
          .catch(() => undefined);
      } else if (error instanceof ApiError && error.code?.startsWith('CREDIT_')) {
        void invalidateGiftData(queryClient);
        toast.error(error.message);
      } else {
        toast.error(errorText(error, t('Could not start the payment. Please try again.')));
      }
    } finally {
      setPaymentFlowOnScreen(false);
      bookingLockRef.current = false;
      setLoading(false);
    }
  };

  const saveDraftItems = async (): Promise<{ vehicleId: string; addressId: string | null; carSaved: boolean } | null> => {
    setSavingDraft(true);
    try {
      if (needsName && profileName.trim()) {
        const profileNow = await updateProfile({ name: profileName.trim() });
        useAuth.getState().setName(profileNow.name);
        useUserStore.setState((st) => ({ profile: st.profile ? { ...st.profile, name: profileNow.name } : st.profile }));
      }
      let vehicleId = savedVehicleId;
      let carSaved = false;
      if (selectedVehicle === DRAFT_CAR && draftCar) {
        if (!savedDraftCarId.current) {
          const created = await createVehicle({
            make: draftCar.make.trim(),
            model: draftCar.model.trim(),
            vehicleType: draftCar.vehicleType,
            isDefault: useUserStore.getState().vehicles.length === 0,
          });
          useUserStore.setState((st) => ({ vehicles: [...st.vehicles, created] }));
          savedDraftCarId.current = created.id;
        }
        vehicleId = savedDraftCarId.current;
        carSaved = true;
      }
      let addressId = usesAddress ? selectedAddress : null;
      if (usesAddress && selectedAddress === DRAFT_ADDRESS && draftAddress) {
        if (!savedDraftAddressId.current) {
          const created = await createAddress({
            label: draftAddress.label,
            address: draftAddress.address,
            city: draftAddress.city,
            lat: draftAddress.lat,
            lng: draftAddress.lng,
            geoSource: draftAddress.geoSource,
            isDefault: useUserStore.getState().addresses.length === 0,
          });
          useUserStore.setState((st) => ({ addresses: [...st.addresses, created] }));
          savedDraftAddressId.current = created.id;
        }
        addressId = savedDraftAddressId.current;
      }
      if (!vehicleId) return null;
      if (carSaved) {
        setPickedVehicle(vehicleId);
        setDraftCar(null);
      }
      if (addressId && addressId === savedDraftAddressId.current) {
        setPickedAddress(addressId);
        setDraftAddress(null);
      }
      return { vehicleId, addressId, carSaved };
    } catch (error) {
      toast.error(errorText(error, t("Couldn't save your car and address. Try again.")));
      return null;
    } finally {
      setSavingDraft(false);
    }
  };

  const checkOfferFor = async (vehicleId: string): Promise<{ code?: string } | null> => {
    if (!offerCode) return {};
    offerCheckedFor.current = `${offerCode}|${serviceKey}|${vehicleId}`;
    const code = offerCode;
    try {
      const applied = await applyPromo.mutateAsync({ code, vendorId, serviceIds, vehicleId });
      setAppliedPromo({ discount: applied, serviceKey, vehicleId });
      return { code: applied.code };
    } catch (error) {
      setAppliedPromo(null);
      if (error instanceof ApiError && isLastingRefusal(error.code)) {
        setRefusedOffer(code);
        forgetPendingCode();
      } else {
        offerCheckedFor.current = null;
      }
      toast.error(t("{code} doesn't apply to this booking. Check the total, then tap Pay.", { code }));
      return null;
    }
  };

  const handlePay = async (customer?: { name?: string; phone?: string }, fromVerify = false) => {
    if (paidRef.current || bookingLockRef.current || loading || savingDraft) return;
    if (finishingSignInRef.current && !fromVerify) return;
    if (savingDraftRef.current) return;
    if (applyPromo.isPending) return;
    const pendingDrafts = selectedVehicle === DRAFT_CAR || selectedAddress === DRAFT_ADDRESS || (needsName && profileName.trim().length > 0);
    if (!pendingDrafts) {
      await handleConfirm();
      return;
    }
    savingDraftRef.current = true;
    try {
      const saved = await saveDraftItems();
      if (!saved) return;
      let discountCode = appliedDiscount?.code;
      if (!discountCode && saved.carSaved && !nothingPriced) {
        const offer = await checkOfferFor(saved.vehicleId);
        if (!offer) return;
        discountCode = offer.code;
      }
      await handleConfirm({ vehicleId: saved.vehicleId, addressId: saved.addressId, discountCode, customer });
    } finally {
      savingDraftRef.current = false;
    }
  };

  const handleVerify = async () => {
    if (finishingSignInRef.current) return;
    const payAfter = nextStep === 'signin';
    finishingSignInRef.current = true;
    setFinishingSignIn(true);
    try {
      const ok = await signIn.verify();
      if (!ok) return;
      setSignedInHere(true);
      setSignInOpen(false);
      if (!payAfter || !signIn.isNew) {
        setTimeout(() => goToStep('signin'), 300);
        return;
      }
      await handlePay({ name: signIn.name.trim() || useAuth.getState().user?.name, phone: signIn.phone }, true);
    } finally {
      finishingSignInRef.current = false;
      setFinishingSignIn(false);
    }
  };

  useEffect(() => {
    if (!keepsDraft || !vendor || selectedServices.length === 0) return;
    writeBookingDraft({
      vendorId,
      vendorName: vendor.name,
      serviceIds: selectedServices.map((service) => service.id),
      addOnIds: pickedAddOnIds,
      mode: bookingType,
      slot: selectedSlot,
      car: draftCar,
      address: draftAddress,
      savedAt: Date.now(),
    });
  }, [keepsDraft, vendor, vendorId, selectedServices, pickedAddOnIds, bookingType, selectedSlot, draftCar, draftAddress]);

  if (loadProblem) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <Header title={t('Book your wash')} />
        {loadProblem === 'gone' ? (
          <View style={styles.gone}>
            <T size={15} lh={22} color={colors.textSecondary} align="center">
              {t("This garage isn't taking bookings on Detlio.")}
            </T>
            <Pressable accessibilityRole="link" onPress={() => router.replace('/garages' as Href)} style={styles.goneLink}>
              <T size={15} weight={500} lh={20} style={styles.underline}>
                {t('Find another garage')}
              </T>
            </Pressable>
          </View>
        ) : (
          <ErrorState
            message={t("Couldn't load this garage. Check your connection.")}
            onRetry={() => {
              setLoadProblem(null);
              setLoadAttempt((n) => n + 1);
            }}
          />
        )}
      </View>
    );
  }

  const selectedCar =
    selectedVehicle === DRAFT_CAR && draftCar ? { model: draftCar.model.trim() } : (vehicles.find((v) => v.id === selectedVehicle) ?? null);
  const guaranteeApplies = guaranteeOn && guaranteeCovers(selectedServices, (serviceId) => categoryById[serviceId]);
  const suggestionApplied = !!appliedReward && appliedReward.code === suggestedCode;
  const busy = loading || savingDraft || finishingSignIn;

  const hint =
    nextStep === 'address'
      ? addressOptions.length === 0
        ? isPickup
          ? t('Add the address we should collect your car from.')
          : t('Add the address we should come to.')
        : isPickup
          ? t('Pick the address we should collect your car from.')
          : t('Pick the address we should come to.')
      : nextStep === 'pin'
        ? isPickup
          ? t('We need the exact spot to check this garage collects from you.')
          : t('We need the exact spot to check this garage travels to you.')
        : nextStep === 'outside'
          ? outsideAdvice
          : nextStep === 'signin'
            ? t('Sign in with your number to pay. No password: we text you a code.')
            : nextStep === 'name'
              ? t('The garage sees your name on your booking.')
              : nextStep === 'unpriced'
                ? tn(
                    unpricedLines.length,
                    '{services} is not priced for your vehicle type. Remove it, pick another car, or contact the garage.',
                    '{services} are not priced for your vehicle type. Remove them, pick another car, or contact the garage.',
                    { services: unpricedLines.map((line) => line.service.name).join(', ') }
                  )
                : nextStep
                  ? t('You pay now. Your booking is confirmed once the garage accepts it.')
                  : inspectionBooking
                    ? t('Nothing to pay now. After inspecting your car the garage sends the price in the app, and you pay it here. Your booking is confirmed once the garage accepts it.')
                    : freeBooking
                    ? t('Your free wash covers it: nothing to pay. Your booking is confirmed once the garage accepts it.')
                    : toPay === 0
                      ? t('Paid with your Detlio credit. Your booking is confirmed once the garage accepts it.')
                      : null;

  const payLabel = loading
    ? t('Processing payment...')
    : savingDraft
      ? t('Saving your car…')
      : !nextStep && applyPromo.isPending
        ? t('Checking…')
        : nextStep
          ? stepLabels[nextStep]
          : toPay == null
            ? t('Confirm booking')
            : inspectionBooking
              ? t('Book now')
              : freeBooking
              ? t('Book your free wash')
              : toPay === 0
                ? t('Book with credit')
                : t('Pay {amount}', { amount: money(toPay) });
  // Google's rating while it is this garage's main one (21 Nov 2026).
  const bookGoogle = vendor ? mainGoogleRating(vendor) : null;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <Header title={t('Book your wash')} />
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.body}
      >
        {isGuest && !signInOpen && nextStep !== 'signin' ? (
          <T size={13} lh={18} color={colors.textSecondary} style={styles.haveAccount}>
            {`${t('Have an account?')} `}
            <T
              size={13}
              weight={500}
              lh={18}
              style={styles.underline}
              onPress={() => {
                setSignInOpen(true);
                setTimeout(() => goToStep('signin'), 50);
              }}
            >
              {t('Sign in')}
            </T>
          </T>
        ) : null}

        {vendor?.bookingsPaused ? (
          <Notice tone="neutral" title={t('Not taking bookings right now')}>
            {vendor.bookingsPausedReason || t('This garage has paused new bookings. Check back later, or pick another garage.')}
          </Notice>
        ) : null}
        {modeWithdrawn ? (
          <Notice tone="neutral" title={t("{mode} isn't offered here now", { mode: t(BOOKING_TYPE_LABELS[modeWithdrawn]) })}>
            {t('This booking will be {mode}.', { mode: t(BOOKED_AS[bookingType]) })}
          </Notice>
        ) : null}
        {servicesDropped ? (
          <Notice tone="neutral" title={t('Some services are no longer offered')}>
            {t("This garage has stopped offering some of the services you picked, so they've been left out.")}
          </Notice>
        ) : null}

        {vendor && selectedServices.length > 0 ? (
          <Animated.View {...mark('summary')}>
            <HubCard style={styles.cardPad}>
              <View style={styles.between}>
                <T size={17} weight={500} lh={24} tracking={-0.01} style={styles.shrink}>
                  {vendor.name}
                </T>
                {/* The garage's main rating, as on its card and page: Google's while a linked garage has
                    fewer than 5 counted Detlio reviews (21 Nov 2026), else Detlio's own (the d. mark). */}
                {bookGoogle ? (
                  <View style={styles.stars} accessible accessibilityLabel={googleRatingSpoken(bookGoogle)}>
                    <GoogleMark size={13} />
                    <T num size={13} lh={18}>
                      {bookGoogle.rating.toFixed(1)}
                    </T>
                    <T size={13} lh={18} color={colors.dim}>
                      (<T num size={13} lh={18} color={colors.dim}>{String(bookGoogle.reviewCount)}</T>)
                    </T>
                    <GoogleMapsText />
                  </View>
                ) : hasStarScore(vendor) ? (
                  <View style={styles.stars} accessible accessibilityLabel={t('{rating} stars from {count} reviews', { rating: vendor.rating.toFixed(1), count: vendor.reviewCount })}>
                    <DetlioMark size={14} rating={vendor.rating} />
                    <T num size={13} lh={18}>
                      {vendor.rating.toFixed(1)}
                    </T>
                    <T size={13} lh={18} color={colors.dim}>
                      (<T num size={13} lh={18} color={colors.dim}>{String(vendor.reviewCount)}</T>)
                    </T>
                  </View>
                ) : (
                  <T size={13} lh={18} color={colors.dim}>
                    {t('New on Detlio')}
                  </T>
                )}
              </View>
              <View style={styles.metaRow}>
                {vendor.tier ? <TierMark tier={vendor.tier} /> : null}
                <T size={13} lh={18} color={colors.dim}>
                  {[vendor.area, vendor.distanceKm != null ? vendor.distance : null].filter(Boolean).join(' · ')}
                </T>
              </View>
              <View style={styles.lines}>
                {lines.map(({ service, amount }) => {
                  const addOn = pickedAddOnIds.includes(service.id);
                  const unpriced = amount == null && selectedVehicleType != null;
                  return (
                    <View key={service.id} style={styles.lineRow}>
                      <View style={styles.lineName}>
                        {selectedServices.length > 1 || addOn ? (
                          <Pressable accessibilityRole="button" accessibilityLabel={t('Remove {name}', { name: service.name })} onPress={() => removeService(service.id)} style={styles.remove}>
                            <IconX size={15} color={colors.textMuted} />
                          </Pressable>
                        ) : null}
                        <View style={styles.shrink}>
                          <T size={15} lh={22} color={colors.textSecondary}>
                            {service.name}
                            {vehicleTierLabel && service.pricingType === 'per_vehicle' ? (
                              <T size={15} lh={22} color={colors.textMuted}>{` · ${t(vehicleTierLabel)}`}</T>
                            ) : null}
                          </T>
                          {/* An inspection fee's approx price (0073). */}
                          {serviceApproxNote(service) ? (
                            <T size={13} lh={18} color={colors.textMuted}>
                              {serviceApproxNote(service)}
                            </T>
                          ) : null}
                          {addOn ? <AddOnMark /> : null}
                        </View>
                      </View>
                      {/* No fee (0073) is words: they wrap, right-aligned, a size down, as on the web. */}
                      <T
                        size={isNoFeeInspection(service) ? 13 : 15}
                        lh={isNoFeeInspection(service) ? 18 : 22}
                        align={isNoFeeInspection(service) ? 'right' : undefined}
                        style={isNoFeeInspection(service) ? { flexShrink: 1, maxWidth: '45%' } : undefined}
                        color={unpriced ? colors.error : colors.textPrimary}
                      >
                        {unpriced ? t('Not priced') : <Figures size={isNoFeeInspection(service) ? 13 : 15} text={servicePriceText(service, selectedVehicleType)} />}
                      </T>
                    </View>
                  );
                })}
                <T size={13} lh={18} color={colors.dim}>
                  {totalDuration !== null ? <><T num size={13} lh={18} color={colors.dim}>{formatDuration(totalDuration)}</T>{' · '}</> : null}
                  {t(BOOKING_TYPE_LABELS[bookingType])}
                </T>
              </View>
            </HubCard>
          </Animated.View>
        ) : null}

        {vendor && selectedServices.length > 0 && !requestMode && garageAddOns.length > 0 ? (
          <CheckoutAddOns addOns={garageAddOns} picked={pickedAddOnIds} vehicleType={selectedVehicleType ?? undefined} onToggle={toggleAddOn} />
        ) : null}

        {acceptedRequest && acceptedRequest.acceptedStartAt && acceptedRequest.confirmBy ? (
          <View style={styles.accepted}>
            <T size={11} weight={500} lh={15} uppercase tracking={0.12} color={colors.success}>
              {t('Accepted request')}
            </T>
            <T size={17} weight={500} lh={24}>
              {acceptedRequest.bookingType === 'pickup'
                ? t('{name} will collect your car {when}', { name: acceptedRequest.garage.name, when: istStartLabel(acceptedRequest.acceptedStartAt) })
                : t('{name} will come {when}', { name: acceptedRequest.garage.name, when: istStartLabel(acceptedRequest.acceptedStartAt) })}
            </T>
            <T size={13} lh={18} color={colors.textSecondary}>
              {`${selectedVehicleLabel ? `${selectedVehicleLabel} · ` : ''}${selectedAddressRecord?.label || selectedAddressRecord?.address || ''}`}
            </T>
            <T size={13} lh={18} color={colors.success}>
              {t('Held for you until {time}. The car, address and time are what the garage said yes to.', { time: istClock(acceptedRequest.confirmBy) })}
            </T>
          </View>
        ) : null}
        {requestParam && authUser && myRequest.data && !acceptedRequest ? (
          <Notice tone="neutral" title={t('This request is no longer open')}>
            {t('It was answered, cancelled or ran out of time.')}
          </Notice>
        ) : null}

        {!requestMode && modeOptions.length > 1 ? (
          <View>
            <ModeSwitch modes={modeOptions.map((option) => option.value)} value={bookingType} onChange={setChosenType} track={false} />
            {isPickup ? (
              <T variant="t5" lh={18} color={colors.textMuted} style={styles.mt8}>
                {t('{name} collects your car from your address, works on it at the garage and brings it back.', { name: vendor?.name ?? t('The garage') })}
              </T>
            ) : null}
          </View>
        ) : null}

        {!requestMode ? (
          <Animated.View {...mark('slot')}>
            <WhenPicker
              autoPick
              vendorId={vendorId}
              serviceIds={serviceIds}
              value={selectedSlot}
              onChange={pickSlot}
              bookingType={bookingType}
              onLapse={handleSlotLapse}
              // Only while nothing is in flight: once Pay is pressed the customer's own booking
              // can take the time off the refetched list, and that is not a time lost.
              onTaken={linked && !paid && !loading ? handleSlotTaken : undefined}
              initialDate={dateParam ?? restoredDay}
              renderDayExtra={(state) => (
                <SlotAlertAsk
                  state={state}
                  vendorId={vendorId}
                  serviceIds={serviceIds}
                  bookingType={bookingType}
                  backTo={`/book/${vendorId}?service=${selectedServices.map((s) => s.id).join(',')}`}
                />
              )}
            />
          </Animated.View>
        ) : null}

        {!requestMode ? (
          <Animated.View {...mark('car')}>
            <T variant="t2" style={styles.heading}>
              {t('Car')}
            </T>
            {isGuest ? (
              <GuestCarForm
                car={draftCar}
                onChange={(car) => {
                  setDraftCar(car);
                  setPickedVehicle(null);
                }}
              />
            ) : vehicles.length === 0 && !carDraftReady ? (
              <View style={styles.warnCard}>
                <T size={15} lh={22}>
                  {t('Add a car to continue')}
                </T>
                <T size={13} lh={18} color={colors.textSecondary}>
                  {t("We need to know which car we're washing — pricing can differ by type.")}
                </T>
                <View style={styles.mt4}>
                  <ScButton variant="outline" fullWidth={false} height={44} paddingX={16} onPress={() => setAddCarOpen(true)}>
                    <IconPlus size={16} color={colors.textPrimary} />
                    <Label>{t('Add a car')}</Label>
                  </ScButton>
                </View>
              </View>
            ) : (
              <View style={styles.carGrid}>
                {carDraftReady && draftCar ? (
                  <View style={styles.carCell}>
                    <PickButton radius={18} on={selectedVehicle === DRAFT_CAR} onPress={() => setPickedVehicle(DRAFT_CAR)} style={styles.carFace}>
                      <T size={14} weight={600} lh={18} numberOfLines={1}>
                        {`${draftCar.make.trim()} ${draftCar.model.trim()}`}
                      </T>
                      <T variant="t5" color={colors.textMuted} numberOfLines={1}>
                        {t('{type} · new', { type: t(VEHICLE_TIERS.find((tier) => tier.value === draftCar.vehicleType)?.label ?? '') })}
                      </T>
                    </PickButton>
                  </View>
                ) : null}
                {vehicles.map((v) => {
                  const on = selectedVehicle === v.id;
                  // The red light, as chosen things have; red as a button here is Pay's.
                  return (
                    <View key={v.id} style={styles.carCell}>
                      <PickButton radius={18} on={on} accessibilityLabel={`${v.make} ${v.model}${v.plate ? `, ${v.plate}` : ''}`} onPress={() => setPickedVehicle(v.id)} style={styles.carFace}>
                        <T size={14} weight={600} lh={18} numberOfLines={1}>
                          {`${v.make} ${v.model}`}
                        </T>
                        {v.plate ? (
                          <NumberPlate plate={v.plate} size="sm" />
                        ) : (
                          <T variant="t5" color={colors.textMuted} numberOfLines={1}>
                            {t(VEHICLE_TIERS.find((tier) => tier.value === v.vehicleType)?.label ?? '')}
                          </T>
                        )}
                      </PickButton>
                    </View>
                  );
                })}
                <Pressable accessibilityRole="button" onPress={() => setAddCarOpen(true)} style={[styles.carCell, styles.dashed]}>
                  <IconPlus size={15} color="#FF4D66" />
                  <T variant="t4" weight={600} color={colors.textSecondary}>
                    {t('Add another car')}
                  </T>
                </Pressable>
              </View>
            )}
          </Animated.View>
        ) : null}

        {usesAddress && !requestMode ? (
          <Animated.View {...mark('address')}>
            <T variant="t2" style={styles.heading}>
              {isPickup ? t('Where should we collect your car?') : t('Where should we come?')}
            </T>
            {isPickup && addressOptions.length > 0 ? (
              <T size={13} lh={18} color={colors.textSecondary} style={styles.addressNote}>
                {t('The garage brings your car back to the same address.')}
              </T>
            ) : null}
            {addressOptions.length === 0 ? (
              <View style={styles.warnCard}>
                <T size={15} lh={22}>
                  {t('Add an address to continue')}
                </T>
                <T size={13} lh={18} color={colors.textSecondary}>
                  {isPickup ? t('Pickup & drop needs the address your car is collected from.') : t('Doorstep service needs somewhere to go.')}
                </T>
                <View style={styles.mt4}>
                  <ScButton variant="outline" fullWidth={false} height={44} paddingX={16} onPress={() => setAddAddressOpen(true)}>
                    <IconPlus size={16} color={colors.textPrimary} />
                    <Label>{t('Add an address')}</Label>
                  </ScButton>
                </View>
              </View>
            ) : (
              <View style={styles.addressList}>
                {addressOptions.map((a) => (
                  <PickButton
                    key={a.id}
                    radius={18}
                    on={selectedAddress === a.id}
                    accessibilityLabel={`${a.label}, ${a.address}`}
                    onPress={() => pickAddress(a.id)}
                    style={styles.addressRow}
                  >
                    <View style={styles.pinDisc}>
                      <IconMapPin size={17} color={colors.textSecondary} />
                    </View>
                    <View style={styles.grow}>
                      <T size={14} weight={600} lh={18}>
                        {a.label}
                        {a.id === DRAFT_ADDRESS && !isGuest ? <T size={15} lh={20} color={colors.textMuted}> {t('· new')}</T> : null}
                      </T>
                      <T variant="t5" color={colors.textMuted} numberOfLines={1}>
                        {a.address}
                      </T>
                      {outsidePickup(a) ? (
                        <T variant="t4" weight={400} color={colors.error} style={styles.mt2}>
                          {t("Outside this garage's pickup area")}
                        </T>
                      ) : null}
                    </View>
                  </PickButton>
                ))}
                {addressOutside ? (
                  <View style={styles.warnCardSm}>
                    <T size={15} lh={22}>
                      {t("This garage doesn't pick up from this address")}
                    </T>
                    <T size={13} lh={18} color={colors.textSecondary}>
                      {otherMode ? t('Try another address, or book {mode} instead.', { mode: t(BOOKED_AS[otherMode]) }) : t('Try another address.')}
                    </T>
                    {otherMode ? (
                      <View style={styles.mt4}>
                        <ScButton variant="outline" fullWidth={false} height={44} paddingX={16} onPress={() => setChosenType(otherMode)}>
                          {t('Choose {mode}', { mode: t(BOOKING_TYPE_LABELS[otherMode]) })}
                        </ScButton>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {addressNeedsPin ? (
                  <View style={styles.warnCardSm}>
                    <T size={15} lh={22}>
                      {t('Pin the exact spot')}
                    </T>
                    <T size={13} lh={18} color={colors.textSecondary}>
                      {isPickup ? t('We need it to check this garage collects from you, and so the driver finds your car.') : t('We need it to check this garage travels to you.')}
                      {pinningAddress ? ` ${t('Saving...')}` : ''}
                    </T>
                    <LocationPicker showSearch onChange={(picked) => void handlePinAddress(picked)} />
                  </View>
                ) : null}
                <Pressable accessibilityRole="button" onPress={() => setAddAddressOpen(true)} style={[styles.addRow, styles.dashed]}>
                  {!isGuest ? <IconPlus size={15} color="#FF4D66" /> : null}
                  <T variant="t4" weight={600} color={colors.textSecondary}>
                    {isGuest ? t('Change address') : t('Add another address')}
                  </T>
                </Pressable>
              </View>
            )}
          </Animated.View>
        ) : null}

        {selectedServices.length > 0 && (savedVehicleId || creditOffered) && !unpricedForVehicle && !nothingPriced ? (
          <View>
            <T variant="t2" style={styles.heading}>
              {t('Savings')}
            </T>
            <HubCard style={styles.savings}>
              {savedVehicleId ? (
                appliedDiscount ? (
                  <View style={styles.savingRow}>
                    <View style={styles.grow}>
                      <T size={15} lh={22}>
                        {suggestionApplied && appliedReward
                          ? t('Best for you: {label}', { label: appliedReward.label })
                          : appliedReward
                            ? t('{label} applied', { label: appliedReward.label })
                            : appliedCoupon
                              ? t('Coupon applied: {title}', { title: appliedCoupon.title })
                              : freeWashes.some((w) => w.code.toUpperCase() === appliedDiscount.code.toUpperCase())
                                ? t('Free wash applied')
                                : t('{label} applied', { label: appliedDiscount.code })}
                      </T>
                      <T size={13} lh={18} color={colors.success}>
                        <Figures size={13} text={suggestionApplied ? t('Saves {amount} · applied', { amount: money(appliedDiscount.discountAmount) }) : t('Saves {amount}', { amount: money(appliedDiscount.discountAmount) })} />
                      </T>
                    </View>
                    <Pressable accessibilityRole="button" onPress={handleRemovePromo} style={styles.removePromo}>
                      <T size={15} lh={20}>
                        {t('Remove')}
                      </T>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.py4}>
                    <Pressable accessibilityRole="button" onPress={() => setPromoOpen(true)} style={styles.promoRow}>
                      <View style={styles.promoLeft}>
                        <View style={styles.promoIcon}>
                          <IconPercentage size={15} color={colors.success} />
                        </View>
                        <T size={15} lh={22}>
                          {t('Coupons and offers')}
                        </T>
                      </View>
                      <View style={styles.promoRight}>
                        <T size={13} lh={18}>
                          {offerChecking ? t('Checking {code}…', { code: offerCode }) : t('Apply')}
                        </T>
                        <IconChevronRight size={15} color={colors.textPrimary} />
                      </View>
                    </Pressable>
                    {offerProblem ? (
                      <View style={styles.offerProblem}>
                        <View style={styles.problemLine}>
                          <IconAlertCircle size={15} color={colors.error} />
                          <T size={13} lh={18} color={colors.error} style={styles.grow}>
                            {t("{code} doesn't apply to this booking. {problem}", { code: offerCode ?? '', problem: offerProblem })}
                          </T>
                        </View>
                        <Pressable accessibilityRole="button" accessibilityLabel={t('Remove {name}', { name: offerCode ?? '' })} onPress={handleRemovePromo} style={styles.removePromo}>
                          <T size={13} lh={18}>
                            {t('Remove')}
                          </T>
                        </Pressable>
                      </View>
                    ) : null}
                    {rewardVouchers.length > 0 || myCoupons.length > 0 || freeWashes.length > 0 ? (
                      <View style={styles.pills}>
                        {freeWashes.map((wash) => (
                          <Pressable key={wash.code} accessibilityRole="button" disabled={applyPromo.isPending} onPress={() => handleApplyReward(wash.code)} style={[styles.pill, applyPromo.isPending && styles.dim]}>
                            <T size={13} lh={18}>
                              {t('Free wash · up to ₹{amount}', { amount: wash.amount })}
                            </T>
                          </Pressable>
                        ))}
                        {rewardVouchers.slice(0, 4).map((voucher) => (
                          <Pressable key={voucher.id} accessibilityRole="button" disabled={applyPromo.isPending} onPress={() => handleApplyReward(voucher.code!)} style={[styles.pill, applyPromo.isPending && styles.dim]}>
                            <T size={13} lh={18}>
                              <T num size={13} lh={18}>{t('{amount} off', { amount: rewardRupees(voucher.amount) })}</T>
                              <T size={13} lh={18} color={colors.textSecondary}>{` · ${voucher.label}`}</T>
                            </T>
                          </Pressable>
                        ))}
                        {myCoupons.slice(0, 4).map((coupon) => (
                          <Pressable key={coupon.id} accessibilityRole="button" disabled={applyPromo.isPending} onPress={() => handleApplyReward(coupon.code)} style={[styles.pill, applyPromo.isPending && styles.dim]}>
                            <T size={13} lh={18}>
                              {coupon.title}
                            </T>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                )
              ) : null}
              {creditOffered ? (
                <View style={[styles.savingRow, savedVehicleId ? styles.topLine : null]}>
                  <T size={15} lh={22} style={styles.grow}>
                    <Figures size={15} text={t('Use {amount} Detlio credit', { amount: money(creditSplit.credit) })} />
                  </T>
                  <ScSwitch label={t('Use Detlio credit')} checked={creditSwitchOn} disabled={loading} onChange={setCreditSwitchOn} />
                </View>
              ) : null}
            </HubCard>
          </View>
        ) : null}

        {selectedServices.length > 0 ? (
          <View style={styles.priceBlock}>
            <HubCard style={styles.priceCard}>
              {lineCount > 1 ? (
                <View style={styles.priceRow}>
                  <T size={15} lh={22} color={colors.textSecondary}>
                    {t('Subtotal')}
                  </T>
                  <T num size={15} lh={22}>
                    {subtotal == null || !selectedVehicle ? '—' : money(subtotal)}
                  </T>
                </View>
              ) : null}
              {isPickup ? (
                <View style={styles.priceRow}>
                  <View style={styles.shrink}>
                    <T size={15} lh={22} color={colors.textSecondary}>
                      {pickupLineLabel(pickupRoadKm)}
                    </T>
                    {selectedAddressRecord ? (
                      <T size={13} lh={18} color={colors.textMuted} numberOfLines={1}>
                        {t('From and back to {address}', { address: selectedAddressRecord.address })}
                      </T>
                    ) : null}
                  </View>
                  {pickupFee > 0 ? (
                    <T num size={15} lh={22}>
                      {money(pickupFee)}
                    </T>
                  ) : (
                    <T size={15} lh={22} color={colors.success}>
                      {pickupFeeLabel(0)}
                    </T>
                  )}
                </View>
              ) : null}
              {convenienceFee > 0 ? (
                <View style={styles.priceRow}>
                  <T size={15} lh={22} color={colors.textSecondary}>
                    {t(CONVENIENCE_FEE_LABEL)}
                  </T>
                  <T num size={15} lh={22}>
                    {money(convenienceFee)}
                  </T>
                </View>
              ) : null}
              {travelFee > 0 && !isPickup ? (
                <View style={styles.priceRow}>
                  <T size={15} lh={22} color={colors.textSecondary}>
                    {t('Travel fee')}
                  </T>
                  <T num size={15} lh={22}>
                    {money(travelFee)}
                  </T>
                </View>
              ) : null}
              {appliedDiscount ? (
                <View style={styles.priceRow}>
                  <T size={15} lh={22} color={colors.textSecondary} numberOfLines={1} style={styles.shrink}>
                    {t('Discount ({code})', { code: appliedDiscount.code })}
                  </T>
                  <T num size={15} lh={22} color={colors.success}>
                    {`−${money(appliedDiscount.discountAmount)}`}
                  </T>
                </View>
              ) : null}
              {creditApplied ? (
                <View style={styles.priceRow}>
                  <T size={15} lh={22} color={colors.textSecondary}>
                    {t('Detlio credit')}
                  </T>
                  <T num size={15} lh={22} color={colors.success}>
                    {`−${money(creditSplit.credit)}`}
                  </T>
                </View>
              ) : null}
              <View style={[styles.priceRow, (lineCount > 1 || isPickup || travelFee > 0 || convenienceFee > 0 || appliedDiscount || creditApplied) && styles.totalLine]}>
                <T size={17} lh={24}>
                  {inspectionBooking ? t('Pay after inspection') : t('To pay')}
                </T>
                <T num size={20} lh={28}>
                  {toPay == null || !selectedVehicle ? '—' : money(toPay)}
                </T>
              </View>
            </HubCard>
            {isPickup && pickupFee > 0 ? (
              <View style={styles.problemLine}>
                <IconCheck size={16} color={colors.success} />
                <T size={13} lh={20} style={styles.grow}>
                  {t(PICKUP_FEE_FULL_LINE)}
                </T>
              </View>
            ) : null}
            {isPickup ? (
              <View style={styles.problemLine}>
                <IconShieldCheck size={16} color={colors.textSecondary} />
                <T size={13} lh={20} style={styles.grow}>
                  {PICKUP_RESPONSIBILITY_LINE}
                </T>
              </View>
            ) : null}
            {selectedServices.some((service) => service.pricingType === 'on_inspection') ? (
              <T size={13} lh={20} color={colors.textSecondary}>
                {/* Every inspection line without a fee (0073): nothing now. */}
                {selectedServices.every((service) => service.pricingType !== 'on_inspection' || isNoFeeInspection(service))
                  ? t('No inspection fee. After seeing your car the garage sends the price in the app, and you pay it here.')
                  : t('You pay the inspection fee now. If the work costs more, the garage sends the final bill in the app and you pay the rest here.')}
              </T>
            ) : null}
            <T size={12} lh={18} color={colors.textMuted}>
              <T size={12} lh={18} color={colors.textSecondary}>
                {`${t('Cancellation policy:')} `}
              </T>
              {t("Cancel any time until the garage accepts. Once it has, cancel or reschedule up to 2 hours before your slot. You can reschedule up to 2 times; each new time goes back to the garage to accept, and if it can't take it, the booking is cancelled. If you don't turn up for an accepted booking, it isn't refunded.")}
              {isPickup ? ` ${t('Once the garage has collected your car, the booking can’t be cancelled or moved in the app.')}` : ''}
              {isPickup ? ` ${t(PICKUP_FEE_REFUND_LINE)}` : ''}
            </T>
            {selectedVehicle && !savedVehicleId ? (
              <T size={13} lh={20} color={colors.textSecondary}>
                {offerCode ? t('Code {code} is checked when you pay.', { code: offerCode }) : t('Have a coupon? You can apply it once you’re signed in.')}
              </T>
            ) : null}
          </View>
        ) : null}

        {isGuest && (signInOpen || nextStep === 'signin') ? (
          <Animated.View {...mark('signin')}>
            <CheckoutSignInCard
              signIn={signIn}
              busy={busy}
              onVerify={() => void handleVerify()}
              verifyLabel={
                nextStep === 'signin' && signIn.isNew && toPay != null && toPay > 0
                  ? t('Verify and pay {amount}', { amount: money(toPay) })
                  : nextStep === 'signin'
                    ? t('Verify and continue')
                    : t('Verify')
              }
            />
          </Animated.View>
        ) : null}

        {!isGuest && (needsName || signedInHere) ? (
          <Animated.View {...mark('signin')}>
            <HubCard style={styles.signedIn}>
              <T size={17} weight={500} lh={24} tracking={-0.01}>
                {needsName ? t('Your name') : authUser?.name && authUser.name !== 'User' ? t('Signed in as {name}', { name: authUser.name }) : t('Signed in')}
              </T>
              {needsName ? (
                <ScInput
                  label={t('Your name (for the garage)')}
                  placeholder={t('Your name')}
                  autoComplete="name"
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={255}
                  value={profileName}
                  onChangeText={setProfileName}
                />
              ) : null}
              {selectedVehicle === DRAFT_CAR && vehicles.length > 0 ? (
                <View style={styles.useSaved}>
                  <T size={13} lh={18} color={colors.textSecondary}>
                    {t("We'll save the car you entered. Or use a saved one:")}
                  </T>
                  <View style={styles.pillsFlat}>
                    {vehicles.map((v) => (
                      <Pressable key={v.id} accessibilityRole="button" onPress={() => setPickedVehicle(v.id)} style={styles.pill}>
                        <T size={13} lh={18}>
                          {t('Use saved: {make} {model}', { make: v.make, model: v.model })}
                        </T>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              {selectedAddress === DRAFT_ADDRESS && addresses.length > 0 ? (
                <View style={styles.useSaved}>
                  <T size={13} lh={18} color={colors.textSecondary}>
                    {t("We'll save the address you entered. Or use a saved one:")}
                  </T>
                  <View style={styles.pillsFlat}>
                    {addresses.map((a) => (
                      <Pressable key={a.id} accessibilityRole="button" onPress={() => pickAddress(a.id)} style={styles.pill}>
                        <T size={13} lh={18}>
                          {t('Use saved: {label}', { label: a.label })}
                        </T>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              {!needsName && selectedVehicle !== DRAFT_CAR && selectedAddress !== DRAFT_ADDRESS ? (
                <T size={13} lh={18} color={colors.textSecondary}>
                  {t("You're signed in. Pay below to send your booking to the garage.")}
                </T>
              ) : null}
            </HubCard>
          </Animated.View>
        ) : null}
      </ScrollView>

      <Glass radius={0} heavy edge={false} style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        {paid && paid.phase !== 'confirming' ? (
          <PaymentReceivedPanel paymentId={paid.paymentId} refundMessage={paid.phase === 'failed' ? paid.refundMessage : undefined} />
        ) : paid ? (
          // Graphite with a spinner, not the red button: red means "this pays".
          <View style={styles.ctaWait}>
            <Spinner size={16} />
            <T variant="t4" weight={600} color={colors.scheme === 'light' ? colors.textSecondary : '#C8C8D0'}>
              {t('Payment received — confirming your booking…')}
            </T>
          </View>
        ) : (
          <>
            {selectedServices.length > 0 ? (
              <View style={styles.barTop}>
                <T variant="t5" color={fx.quietBright} numberOfLines={1} style={styles.shrink}>
                  {`${bookingSummary}${selectedCar ? ` · ${selectedCar.model}` : ''}`}
                </T>
                {subtotal != null && selectedVehicle ? (
                  <T variant="t5" color={fx.quietBright}>
                    {inspectionBooking ? t('Pay after inspection') : toPay != null && toPay !== subtotal ? t('To pay') : t('Total')}{' '}
                    <T num variant="t3" weight={600}>
                      {money(toPay ?? subtotal)}
                    </T>
                  </T>
                ) : null}
              </View>
            ) : null}
            {!nextStep ? (
              <View style={styles.promises}>
                {guaranteeApplies ? (
                  <View style={styles.promise} accessibilityLabel={t(GUARANTEE_BADGE)}>
                    <IconShieldCheck size={13} color={promiseGreen} />
                    <T variant="t5" color={fx.soft}>
                      {t("Free redo within 48 hours if you're not happy")}
                    </T>
                  </View>
                ) : null}
                <View style={styles.promise}>
                  <IconRefresh size={13} color={promiseGreen} />
                  <T variant="t5" color={fx.soft}>
                    {t('Free cancel until the garage accepts')}
                  </T>
                </View>
              </View>
            ) : null}
            {townLine ? (
              <View style={styles.outsideLine}>
                <OutsideCityLine text={townLine} />
              </View>
            ) : null}
            {/* Grey while a step is missing, naming it; a tap scrolls there and nudges it.
                Once nothing is missing it is the solid red Pay, which pops once as it arrives. */}
            {nextStep ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => goToStep(nextStep)}
                style={({ pressed }) => [styles.ctaWait, pressed && !reduceMotion && styles.ctaPressed]}
              >
                <T variant="t4" weight={600} color={colors.scheme === 'light' ? colors.textSecondary : '#C8C8D0'}>
                  {payLabel}
                </T>
              </Pressable>
            ) : (
              <CtaPop>
                <RedButton height={52} radius={16} disabled={busy} onPress={() => void handlePay()} accessibilityLabel={payLabel}>
                  <T variant="t3" weight={600} color={busy ? colors.textMuted : colors.white}>
                    <Figures color={busy ? colors.textMuted : colors.white} size={15} text={payLabel} weight={600} />
                  </T>
                  {!loading ? <IconArrowUpRight size={16} line={1.8} color={busy ? colors.textMuted : colors.white} /> : null}
                </RedButton>
              </CtaPop>
            )}
            {hint ? (
              <T variant="t5" color={colors.textMuted} align="center" style={styles.mt8}>
                {hint}
              </T>
            ) : (
              <View style={styles.secure}>
                <IconLock size={12} color={colors.textMuted} />
                <T size={12} lh={16} color={colors.textMuted}>
                  {t('Secure payment by Razorpay · UPI, cards, net banking. Your booking is confirmed once the garage accepts it.')}
                </T>
              </View>
            )}
            {/* Beside Pay, as Razorpay and the E-Commerce Rules expect. */}
            {!hint ? (
              <T size={12} lh={16} align="center" color={colors.textMuted} style={styles.mt8}>
                {/* Nothing paid (a no-fee inspection, a free wash, credit): "By booking" (as the web). */}
                {fill(checkoutAgreement(toPay, 'app'), {
                  terms: (
                    <T size={12} lh={16} color={colors.textMuted} onPress={() => void WebBrowser.openBrowserAsync(`https://detlio.com${LEGAL_PATHS.terms}`)} style={{ textDecorationLine: 'underline' }}>
                      {t('Terms')}
                    </T>
                  ),
                  policy: (
                    <T size={12} lh={16} color={colors.textMuted} onPress={() => void WebBrowser.openBrowserAsync(`https://detlio.com${LEGAL_PATHS.refunds}`)} style={{ textDecorationLine: 'underline' }}>
                      {t('Cancellation & Refund Policy')}
                    </T>
                  ),
                })}
              </T>
            ) : null}
          </>
        )}
      </Glass>

      <AddCarSheet open={addCarOpen} onClose={() => setAddCarOpen(false)} onAdded={(vehicle) => setPickedVehicle(vehicle.id)} />
      <AddAddressSheet
        open={addAddressOpen}
        onClose={() => setAddAddressOpen(false)}
        onAdded={(address) => pickAddress(address.id)}
        pickup={isPickup}
        onSaveLocal={
          isGuest
            ? (address) => {
                setDraftAddress(address);
                setRefusedAddressIds((ids) => ids.filter((id) => id !== DRAFT_ADDRESS));
              }
            : undefined
        }
      />

      <ScSheet horizontalPadding={16} open={promoOpen} onClose={() => setPromoOpen(false)} dismissible={!applyPromo.isPending} accessibilityLabel={t('Coupons and offers')}>
        <T size={20} lh={28} tracking={-0.015}>
          {t('Coupons and offers')}
        </T>
        <View style={styles.promoBox}>
          <TextInput
            accessibilityLabel={t('Coupon code')}
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect={false}
            placeholder={t('Enter coupon code')}
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={colors.keyboard}
            value={promoInput}
            onChangeText={(text) => setPromoInput(text.toUpperCase())}
            onSubmitEditing={handleApplyPromo}
            style={styles.promoInput}
          />
          <Pressable accessibilityRole="button" disabled={!canApplyPromo || applyPromo.isPending} onPress={handleApplyPromo} style={styles.promoApply}>
            <T size={15} weight={500} lh={20} color={canApplyPromo && !applyPromo.isPending ? colors.textPrimary : colors.textMuted}>
              {applyPromo.isPending ? t('Checking…') : t('Apply')}
            </T>
          </Pressable>
        </View>
        {promoError ? (
          <View style={[styles.problemLine, styles.mt8]} accessibilityRole="alert">
            <IconAlertCircle size={15} color={colors.error} />
            <T size={13} lh={18} color={colors.error} style={styles.grow}>
              {promoError}
            </T>
          </View>
        ) : null}
        <T size={13} lh={18} color={colors.textMuted} style={styles.promoNote}>
          {t('Have a code from Detlio? Enter it above to see your savings before you pay.')}
        </T>
        <View style={styles.scanRow}>
          <ScButton variant="outline" height={44} disabled={applyPromo.isPending || scanBusy} onPress={() => setScanning(true)}>
            {scanBusy ? t('Adding…') : t('Scan a coupon')}
          </ScButton>
        </View>
        {scanning ? (
          <CouponScanner
            onClose={() => setScanning(false)}
            onCode={(scanned) => {
              setScanning(false);
              void addScanned(scanned);
            }}
          />
        ) : null}
      </ScSheet>

      <ConfirmSheet
        open={totalCheck !== null}
        level="firm"
        title={t('The total has changed')}
        body={totalCheck ? t('The total to pay is now {amount}. Nothing has been charged.', { amount: formatRupees(totalCheck.rupees) }) : undefined}
        confirmLabel={totalCheck ? t('Pay {amount}', { amount: formatRupees(totalCheck.rupees) }) : t('Pay')}
        cancelLabel={t("Don't pay")}
        onConfirm={() => {
          totalCheck?.resolve(true);
          setTotalCheck(null);
        }}
        onClose={() => {
          totalCheck?.resolve(false);
          setTotalCheck(null);
        }}
      />
      <ScSheet horizontalPadding={16} open={unsettled} onClose={() => setUnsettled(false)} accessibilityLabel={t('Your last payment')}>
        <T size={20} lh={28} tracking={-0.015}>
          {t("Your last payment isn't settled yet")}
        </T>
        <T size={15} lh={22} color={colors.textSecondary} style={styles.mt8}>
          {t("If you finished paying, it shows up here in a minute, so there's no need to pay again. If you closed the payment without paying, you can start over.")}
        </T>
        <View style={styles.unsettled}>
          <ScButton variant="main" onPress={() => setUnsettled(false)}>
            {t('Wait a minute')}
          </ScButton>
          <ScButton
            variant="outline"
            onPress={() => {
              pendingPayment.list().forEach((last) => {
                if (last.kind === 'intent') pendingPayment.clear(pendingKey(last));
              });
              setUnsettled(false);
            }}
          >
            {t("I didn't pay. Start over")}
          </ScButton>
        </View>
      </ScSheet>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 24 },
  gone: { alignItems: 'center', gap: 12, paddingVertical: 48, paddingHorizontal: 16 },
  goneLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  underline: { textDecorationLine: 'underline' },
  haveAccount: { marginTop: -12 },
  cardPad: { padding: 20 },
  between: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  shrink: { flexShrink: 1, minWidth: 0 },
  grow: { flex: 1, minWidth: 0 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 },
  metaRow: { marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 },
  lines: { marginTop: 16, gap: 10, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 16 },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  lineName: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, flexShrink: 1, minWidth: 0 },
  remove: { height: 44, width: 44, marginVertical: -10, marginLeft: -12, marginRight: -6, alignItems: 'center', justifyContent: 'center' },
  accepted: { gap: 8, borderRadius: 18, borderWidth: 1, borderColor: c.acceptedBorder, backgroundColor: c.acceptedBg, padding: 16 },
  mt8: { marginTop: 8 },
  mt4: { marginTop: 4, alignSelf: 'flex-start' },
  mt2: { marginTop: 2 },
  heading: { marginBottom: 12 },
  warnCard: { gap: 8, alignItems: 'flex-start', borderRadius: 22, borderWidth: 1, borderColor: c.scheme === 'dark' ? 'rgba(245,165,36,0.4)' : 'rgba(217,138,0,0.4)', backgroundColor: c.warningMuted, padding: 16 },
  warnCardSm: { gap: 8, borderRadius: 18, borderWidth: 1, borderColor: c.scheme === 'dark' ? 'rgba(245,165,36,0.4)' : 'rgba(217,138,0,0.4)', backgroundColor: c.warningMuted, padding: 16 },
  carGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  carCell: { width: '48.8%', minHeight: 56, borderRadius: 18 },
  carFace: { minHeight: 56, alignItems: 'flex-start', justifyContent: 'center', gap: 4, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  carTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  choiceOn: { borderColor: c.textPrimary, backgroundColor: c.fillChosen },
  choiceOff: { borderColor: c.line, backgroundColor: c.fillFaint },
  dashed: { borderWidth: 1, borderStyle: 'dashed', borderColor: c.stroke, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  addressNote: { marginTop: -4, marginBottom: 12 },
  addressList: { gap: 8 },
  addressRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  pinDisc: { height: 40, width: 40, borderRadius: 20, backgroundColor: c.disc, alignItems: 'center', justifyContent: 'center' },
  addRow: { minHeight: 48, borderRadius: 18 },
  savings: { paddingHorizontal: 20, paddingVertical: 4 },
  savingRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  topLine: { borderTopWidth: 1, borderTopColor: c.line },
  removePromo: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, marginRight: -8 },
  py4: { paddingVertical: 4 },
  promoRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  promoLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  promoIcon: { height: 28, width: 28, borderRadius: 14, backgroundColor: c.successMuted, alignItems: 'center', justifyContent: 'center' },
  promoRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  offerProblem: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  problemLine: { flexDirection: 'row', gap: 6, flexShrink: 1 },
  pills: { marginBottom: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillsFlat: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: c.stroke, paddingHorizontal: 14, justifyContent: 'center' },
  dim: { opacity: 0.5 },
  priceBlock: { gap: 12 },
  priceCard: { padding: 20, gap: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  totalLine: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12 },
  signedIn: { padding: 20, gap: 12 },
  useSaved: { gap: 8 },
  bar: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: c.scheme === 'light' ? c.border : 'rgba(255,255,255,0.14)',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  // Grey while a step is missing (bk-cta-wait).
  ctaWait: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.scheme === 'light' ? c.border : 'rgba(255,255,255,0.1)',
    backgroundColor: c.scheme === 'light' ? c.surfaceElevated : '#202026',
  },
  ctaPressed: { transform: [{ scale: 0.97 }] },
  barTop: { marginBottom: 10, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  promises: { marginBottom: 10, alignItems: 'center', gap: 4 },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  outsideLine: { marginBottom: 8, alignItems: 'center' },
  secure: { marginTop: 8, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 4 },
  promoBox: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.fillSoft, paddingHorizontal: 12 },
  promoInput: { flex: 1, minWidth: 0, paddingVertical: 14, fontSize: 15, color: c.textPrimary },
  promoApply: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, marginRight: -4 },
  promoNote: { marginTop: 16 },
  scanRow: { marginTop: 12 },
  unsettled: { marginTop: 20, gap: 8 },
}));
