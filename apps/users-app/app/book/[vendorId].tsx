import type { AddOn } from '@repo/core/api/add-ons';
import { addOnsAfterRemoving, jobSummary } from '@repo/core/add-ons';
import { ApiError } from '@repo/core/api/client';
import type { AppliedDiscount } from '@repo/core/api/discounts';
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
import { confirmPayment, intentPollResult, realClock } from '@repo/core/payment-confirmation';
import { insidePickupReach, PICKUP_RESPONSIBILITY_LINE, pickupFeeLabel } from '@repo/core/pickup';
import { resolveServiceAmount } from '@repo/core/pricing';
import { hasStarScore } from '@repo/core/ratings';
import { rewardRupees } from '@repo/core/rewards';
import { knownDurationTotal } from '@repo/core/service-duration';
import { outsideCityCheckoutLine } from '@repo/core/service-city';
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
  IconStarFilled,
  IconX,
} from '@repo/native-ui/icons';
import { ErrorState, HubCard, Notice, ScSegmented, Spinner } from '@repo/native-ui/primitives';
import { ScInput } from '@repo/native-ui/inputs';
import { ScSheet } from '@repo/native-ui/sheet';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader as Header } from '@/components/page-header';
import { AddAddressSheet } from '@/components/checkout/add-address-sheet';
import { CheckoutAddOns } from '@/components/checkout/checkout-add-ons';
import { GuestCarForm } from '@/components/checkout/guest-car';
import { PaymentReceivedPanel } from '@/components/checkout/payment-received-panel';
import { CheckoutSignInCard, useCheckoutSignIn } from '@/components/checkout/sign-in';
import { WhenPicker } from '@/components/checkout/when-picker';
import { TierMark } from '@/components/garage/tier';
import { OutsideCityLine } from '@/components/garage/tier';
import { AddCarSheet } from '@/components/home/add-car-sheet';
import { LocationPicker, type PickedLocation } from '@/components/location-picker';
import { SlotAlertAsk } from '@/components/slot-alerts/slot-alert-ask';
import { getVendorAddOns } from '@/lib/add-ons';
import { useAuth } from '@/lib/auth';
import { bookingCarId } from '@/lib/booking-car';
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
import { checkoutCreditSplit, couponsForCheckout, guaranteeCovers } from '@/lib/checkout-maths';
import { errorText } from '@/lib/error-text';
import { usePendingCheckout } from '@/lib/pending-checkout';
import { isPendingExpired, pendingPayment, readPendingOutcome, setPaymentFlowOnScreen } from '@/lib/pending-payment';
import { money, servicePriceText } from '@/lib/price';
import { istDay } from '@/lib/when-picker';

type CheckoutStep = 'slot' | 'car' | 'address' | 'pin' | 'outside' | 'unpriced' | 'signin' | 'name';

const DRAFT_CAR = 'draft-car';
const DRAFT_ADDRESS = 'draft-address';

const BOOKED_AS: Record<BookingType, string> = {
  dropin: 'at the garage',
  doorstep: 'a doorstep visit',
  pickup: 'pickup & drop',
};

/** apps/users/app/book/[vendorId]/page.tsx. Prices come from the server; what's charged is the server's sum. */
export default function BookScreen() {
  const params = useLocalSearchParams<{
    vendorId: string;
    service?: string;
    addons?: string;
    mode?: string;
    address?: string;
    code?: string;
    date?: string;
    request?: string;
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
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [categoryById, setCategoryById] = useState<Record<string, string>>({});
  const guaranteeOn = useGuaranteeConfig().data?.enabled === true;
  const [servicesDropped, setServicesDropped] = useState(false);
  const [loadProblem, setLoadProblem] = useState<'gone' | 'failed' | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [pickedSlot, setSelectedSlot] = useState<string | null>(() => draftSlotStillAhead(restored?.slot ?? null, Date.now()));
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

  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const stepY = useRef<Partial<Record<'slot' | 'car' | 'address' | 'summary' | 'signin', number>>>({});
  const mark = (step: 'slot' | 'car' | 'address' | 'summary' | 'signin') => ({
    onLayout: (e: { nativeEvent: { layout: { y: number } } }) => {
      stepY.current[step] = e.nativeEvent.layout.y;
    },
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
    : (acceptedRequest?.vehicleId ?? pickedVehicle ?? (carDraftReady ? DRAFT_CAR : bookingCarId(vehicles, livePending?.vehicleId)));
  const savedVehicleId = selectedVehicle === DRAFT_CAR ? null : selectedVehicle;
  const selectedVehicleRecord = vehicles.find((v) => v.id === savedVehicleId);
  const selectedVehicleLabel = selectedVehicleRecord ? `${selectedVehicleRecord.make} ${selectedVehicleRecord.model}`.trim() : null;
  const bookingType = resolveBookingType(acceptedRequest?.bookingType ?? chosenType, vendor);
  const modeWithdrawn = unofferedMode(chosenType, vendor);
  const modeOptions = vendor ? offeredBookingTypes(vendor).map((value) => ({ value, label: BOOKING_TYPE_LABELS[value] })) : [];
  const pickSlot = useCallback((scheduledAt: string | null) => setSelectedSlot(scheduledAt), []);
  const pickAddress = (addressId: string) => setPickedAddress(addressId);

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
  const outsideAdvice = `This garage doesn't pick up from this address. Try another address${otherMode ? ` or choose ${BOOKING_TYPE_LABELS[otherMode]}` : ''}.`;
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
    slot: 'Pick a time',
    car: vehicles.length === 0 ? 'Add your car' : 'Choose your car',
    address: addressOptions.length === 0 ? 'Add your address' : 'Choose an address',
    pin: 'Pin your address on the map',
    outside: 'Choose another address',
    unpriced: 'Remove the unpriced service',
    signin: signIn.phase === 'phone' ? 'Enter your number to pay' : signIn.readyToVerify ? 'Tap Verify and pay above' : 'Enter the code we sent',
    name: 'Add your name',
  };

  const goToStep = (step: CheckoutStep) => {
    const target = { slot: 'slot', car: 'car', address: 'address', pin: 'address', outside: 'address', unpriced: 'summary', signin: 'signin', name: 'signin' } as const;
    const y = stepY.current[target[step]];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };

  const handleSlotLapse = (scheduledAt: string) => {
    toast.info(`${formatClock(scheduledAt)} is now too soon to book. ${noticeSentence(bookingType)} Pick another time.`);
    goToStep('slot');
  };

  const subtotal = unpricedForVehicle ? null : lines.reduce((total, line) => total + Math.round((line.amount ?? 0) * 100), 0) / 100;
  const payableAmount = appliedDiscount
    ? Math.round((Number(appliedDiscount.finalAmount) + travelFee) * 100) / 100
    : subtotal == null
      ? null
      : Math.round((subtotal + travelFee) * 100) / 100;
  const creditBalance = giftsOn ? Number(myCredit.data?.balance ?? 0) : 0;
  const creditSplit = creditBalance > 0 && payableAmount != null && payableAmount > 0 ? checkoutCreditSplit(payableAmount, creditBalance) : null;
  const creditOffered = creditSplit !== null && creditSplit.credit > 0;
  const creditApplied = creditOffered && creditSwitchOn;
  const toPay = creditApplied ? creditSplit.toPay : payableAmount;
  const freeBooking = toPay === 0 && !creditApplied;
  const servicesDuration = knownDurationTotal(selectedServices);
  const totalDuration = servicesDuration === null ? null : pickedAddOns.reduce((total, addOn) => total + addOn.extraMins, servicesDuration);

  const canApplyPromo = promoInput.trim().length >= 3 && selectedServices.length > 0 && savedVehicleId != null && !unpricedForVehicle;

  const handleApplyReward = (code: string) => {
    if (selectedServices.length === 0 || savedVehicleId == null || unpricedForVehicle || applyPromo.isPending) return;
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
          toast.error(errorText(error, "This can't be used on this booking."));
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

  const offerCheckKey = offerCode && selectedServices.length > 0 && savedVehicleId && !unpricedForVehicle ? `${offerCode}|${serviceKey}|${savedVehicleId}` : null;
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
    bestVoucher?.code && !offerCode && !suggestionDropped && !appliedDiscount && selectedServices.length > 0 && savedVehicleId && !unpricedForVehicle
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
      ? errorMessage(applyPromo.error, "This code isn't valid.")
      : '';
  const offerChecking = !!offerCode && applyPromo.isPending && applyPromo.variables?.code === offerCode;
  const offerProblem = offerCode && !appliedDiscount && !offerChecking && applyPromo.variables?.code === offerCode ? promoError : '';

  const handlePinAddress = async (picked: PickedLocation) => {
    if (!selectedAddress) return;
    setPinningAddress(true);
    try {
      const saved = await updateAddress(selectedAddress, { lat: picked.lat, lng: picked.lng, geoSource: picked.source });
      useUserStore.setState((state) => ({ addresses: state.addresses.map((a) => (a.id === saved.id ? saved : a)) }));
      toast.success('Location saved');
    } catch (err) {
      toast.error(errorText(err, 'Could not save that location'));
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
    const last = pendingPayment.read();
    if (!last || last.kind !== 'intent') return true;
    if (isPendingExpired(last, Date.now())) {
      pendingPayment.clear();
      return true;
    }
    try {
      const outcome = await readPendingOutcome(last);
      if (outcome.kind === 'pending') {
        setUnsettled(true);
        return false;
      }
      pendingPayment.clear();
      if (outcome.kind === 'booked') {
        afterBooked(outcome.bookingId);
        return false;
      }
      toast.error(outcome.message);
      return true;
    } catch {
      setUnsettled(true);
      return false;
    }
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
    const discountCode = chosen ? chosen.discountCode : appliedDiscount?.code;
    if (selectedServices.length === 0 || !selectedSlot || !vehicleId) return;
    if (!addressReady) return;
    bookingLockRef.current = true;
    setLoading(true);
    setPaymentFlowOnScreen(true);
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
      });
      if ((order.paidWithCredit || order.free) && order.bookingId) {
        paidRef.current = true;
        afterBooked(order.bookingId);
        return;
      }
      if (!order.orderId) throw new Error('Could not start the payment. Please try again.');
      // Written before the window opens: if the app dies in it, the webhook settles and this finds out.
      pendingPayment.write({ kind: 'intent', intentId: order.intentId, vendorName: vendor?.name ?? '', startedAt: Date.now() });
      const result = await openCheckout(
        { orderId: order.orderId, amount: order.amount, currency: order.currency, keyId: order.keyId ?? '' },
        {
          description: `${bookingSummary} at ${vendor?.name ?? 'the garage'}`,
          name: chosen?.customer?.name ?? profile?.name,
          phone: chosen?.customer?.phone ?? profile?.phone,
        }
      );
      if (result.kind === 'cancelled') {
        pendingPayment.clear();
        toast.info('Payment cancelled. Nothing was booked.');
        return;
      }
      if (result.kind === 'failed') {
        pendingPayment.clear();
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
        pendingPayment.clear();
        afterBooked(outcome.bookingId);
      } else if (outcome.kind === 'failed') {
        pendingPayment.clear();
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
            ? `That time is too soon now. ${noticeSentence('pickup')} Pick a later time.`
            : error.code === 'SLOT_FULL'
              ? 'That time was just taken; pick another.'
              : error.message
        );
        goToStep('slot');
      } else if (error instanceof ApiError && error.code === 'PICKUP_NOT_OFFERED') {
        toast.error(
          `This garage has stopped offering pickup & drop.${otherMode ? ` You can book ${BOOKED_AS[otherMode]} instead, or pick another garage.` : ' Pick another garage.'}`
        );
        void getVendor(vendorId).then((v) => v && setVendor(v));
      } else if (error instanceof ApiError && error.code === 'OUTSIDE_PICKUP_RADIUS') {
        if (addressId) setRefusedAddressIds((current) => [...new Set([...current, addressId])]);
        toast.error(outsideAdvice);
        goToStep('address');
      } else if (error instanceof ApiError && error.code === 'ADDRESS_REQUIRED') {
        toast.error(isPickup ? 'Choose the address we should collect your car from.' : 'Choose the address we should come to.');
        goToStep('address');
      } else if (error instanceof ApiError && error.code === 'ADDRESS_LOCATION_REQUIRED') {
        toast.error(isPickup ? 'Pin your address on the map so the garage can find your car.' : 'Pin your address on the map so the garage can find you.');
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
        toast.error(errorText(error, 'Could not start the payment. Please try again.'));
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
      toast.error(errorText(error, "Couldn't save your car and address. Try again."));
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
      toast.error(`${code} doesn't apply to this booking. Check the total, then tap Pay.`);
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
      if (!discountCode && saved.carSaved) {
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
        <Header title="Book your wash" />
        {loadProblem === 'gone' ? (
          <View style={styles.gone}>
            <T size={15} lh={22} color={colors.textSecondary} align="center">
              {"This garage isn't taking bookings on Detlio."}
            </T>
            <Pressable accessibilityRole="link" onPress={() => router.replace('/garages' as Href)} style={styles.goneLink}>
              <T size={15} weight={500} lh={20} style={styles.underline}>
                Find another garage
              </T>
            </Pressable>
          </View>
        ) : (
          <ErrorState
            message="Couldn't load this garage. Check your connection."
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
          : nextStep === 'signin'
            ? 'Sign in with your number to pay. No password: we text you a code.'
            : nextStep === 'name'
              ? 'The garage sees your name on your booking.'
              : nextStep === 'unpriced'
                ? `${unpricedLines.map((line) => line.service.name).join(', ')} ${unpricedLines.length === 1 ? 'is' : 'are'} not priced for your vehicle type. Remove ${unpricedLines.length === 1 ? 'it' : 'them'}, pick another car, or contact the garage.`
                : nextStep
                  ? 'You pay now. Your booking is confirmed once the garage accepts it.'
                  : freeBooking
                    ? 'Your free wash covers it: nothing to pay. Your booking is confirmed once the garage accepts it.'
                    : toPay === 0
                      ? 'Paid with your Detlio credit. Your booking is confirmed once the garage accepts it.'
                      : null;

  const payLabel = loading
    ? 'Processing payment...'
    : savingDraft
      ? 'Saving your car…'
      : !nextStep && applyPromo.isPending
        ? 'Checking…'
        : nextStep
          ? stepLabels[nextStep]
          : toPay == null
            ? 'Confirm booking'
            : freeBooking
              ? 'Book your free wash'
              : toPay === 0
                ? 'Book with credit'
                : `Pay ${money(toPay)}`;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <Header title="Book your wash" />
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.body}
      >
        {isGuest && !signInOpen && nextStep !== 'signin' ? (
          <T size={13} lh={18} color={colors.textSecondary} style={styles.haveAccount}>
            {'Have an account? '}
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
              Sign in
            </T>
          </T>
        ) : null}

        {vendor?.bookingsPaused ? (
          <Notice tone="neutral" title="Not taking bookings right now">
            {vendor.bookingsPausedReason || 'This garage has paused new bookings. Check back later, or pick another garage.'}
          </Notice>
        ) : null}
        {modeWithdrawn ? (
          <Notice tone="neutral" title={`${BOOKING_TYPE_LABELS[modeWithdrawn]} isn't offered here now`}>
            {`This booking will be ${BOOKED_AS[bookingType]}.`}
          </Notice>
        ) : null}
        {servicesDropped ? (
          <Notice tone="neutral" title="Some services are no longer offered">
            {"This garage has stopped offering some of the services you picked, so they've been left out."}
          </Notice>
        ) : null}

        {vendor && selectedServices.length > 0 ? (
          <View {...mark('summary')}>
            <HubCard style={styles.cardPad}>
              <View style={styles.between}>
                <T size={17} weight={500} lh={24} tracking={-0.01} style={styles.shrink}>
                  {vendor.name}
                </T>
                {hasStarScore(vendor) ? (
                  <View style={styles.stars} accessibilityLabel={`${vendor.rating.toFixed(1)} stars from ${vendor.reviewCount} reviews`}>
                    <IconStarFilled size={13} color={colors.textPrimary} />
                    <T num size={13} lh={18}>
                      {vendor.rating.toFixed(1)}
                    </T>
                    <T size={13} lh={18} color={colors.dim}>
                      (<T num size={13} lh={18} color={colors.dim}>{String(vendor.reviewCount)}</T>)
                    </T>
                  </View>
                ) : (
                  <T size={13} lh={18} color={colors.dim}>
                    New on Detlio
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
                          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${service.name}`} onPress={() => removeService(service.id)} style={styles.remove}>
                            <IconX size={15} color={colors.textMuted} />
                          </Pressable>
                        ) : null}
                        <View style={styles.shrink}>
                          <T size={15} lh={22} color={colors.textSecondary}>
                            {service.name}
                            {vehicleTierLabel && service.pricingType === 'per_vehicle' ? (
                              <T size={15} lh={22} color={colors.textMuted}>{` · ${vehicleTierLabel}`}</T>
                            ) : null}
                          </T>
                          {addOn ? <AddOnMark /> : null}
                        </View>
                      </View>
                      <T size={15} lh={22} color={unpriced ? colors.error : colors.textPrimary}>
                        {unpriced ? 'Not priced' : <Figures size={15} text={servicePriceText(service, selectedVehicleType)} />}
                      </T>
                    </View>
                  );
                })}
                <T size={13} lh={18} color={colors.dim}>
                  {totalDuration !== null ? <><T num size={13} lh={18} color={colors.dim}>{formatDuration(totalDuration)}</T>{' · '}</> : null}
                  {BOOKING_TYPE_LABELS[bookingType]}
                </T>
              </View>
            </HubCard>
          </View>
        ) : null}

        {vendor && selectedServices.length > 0 && !requestMode && garageAddOns.length > 0 ? (
          <CheckoutAddOns addOns={garageAddOns} picked={pickedAddOnIds} vehicleType={selectedVehicleType ?? undefined} onToggle={toggleAddOn} />
        ) : null}

        {acceptedRequest && acceptedRequest.acceptedStartAt && acceptedRequest.confirmBy ? (
          <View style={styles.accepted}>
            <T size={11} weight={500} lh={15} uppercase tracking={0.12} color={colors.success}>
              Accepted request
            </T>
            <T size={17} weight={500} lh={24}>
              {`${acceptedRequest.garage.name} will ${acceptedRequest.bookingType === 'pickup' ? 'collect your car' : 'come'} ${istStartLabel(acceptedRequest.acceptedStartAt)}`}
            </T>
            <T size={13} lh={18} color={colors.textSecondary}>
              {`${selectedVehicleLabel ? `${selectedVehicleLabel} · ` : ''}${selectedAddressRecord?.label || selectedAddressRecord?.address || ''}`}
            </T>
            <T size={13} lh={18} color={colors.success}>
              {`Held for you until ${istClock(acceptedRequest.confirmBy)}. The car, address and time are what the garage said yes to.`}
            </T>
          </View>
        ) : null}
        {requestParam && authUser && myRequest.data && !acceptedRequest ? (
          <Notice tone="neutral" title="This request is no longer open">
            It was answered, cancelled or ran out of time.
          </Notice>
        ) : null}

        {!requestMode && modeOptions.length > 1 ? (
          <View>
            <ScSegmented options={modeOptions} value={bookingType} onChange={setChosenType} />
            {isPickup ? (
              <T size={13} lh={20} color={colors.textSecondary} style={styles.mt8}>
                {`${vendor?.name ?? 'The garage'} collects your car from your address, works on it at the garage and brings it back.`}
              </T>
            ) : null}
          </View>
        ) : null}

        {!requestMode ? (
          <View {...mark('slot')}>
            <WhenPicker
              autoPick
              vendorId={vendorId}
              serviceIds={serviceIds}
              value={selectedSlot}
              onChange={pickSlot}
              bookingType={bookingType}
              onLapse={handleSlotLapse}
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
          </View>
        ) : null}

        {!requestMode ? (
          <View {...mark('car')}>
            <T size={17} weight={500} lh={24} tracking={-0.01} style={styles.heading}>
              Car
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
                  Add a car to continue
                </T>
                <T size={13} lh={18} color={colors.textSecondary}>
                  {"We need to know which car we're washing — pricing can differ by type."}
                </T>
                <View style={styles.mt4}>
                  <ScButton variant="outline" fullWidth={false} height={44} paddingX={16} onPress={() => setAddCarOpen(true)}>
                    <IconPlus size={16} color={colors.textPrimary} />
                    <Label>Add a car</Label>
                  </ScButton>
                </View>
              </View>
            ) : (
              <View style={styles.carGrid}>
                {carDraftReady && draftCar ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedVehicle === DRAFT_CAR }}
                    onPress={() => setPickedVehicle(DRAFT_CAR)}
                    style={[styles.carCell, selectedVehicle === DRAFT_CAR ? styles.choiceOn : styles.choiceOff]}
                  >
                    <View style={styles.carTop}>
                      <T size={15} lh={20} numberOfLines={1} style={styles.shrink}>
                        {`${draftCar.make.trim()} ${draftCar.model.trim()}`}
                      </T>
                      {selectedVehicle === DRAFT_CAR ? <IconCheck size={15} stroke={2} color={colors.textPrimary} /> : null}
                    </View>
                    <T size={13} lh={18} color={colors.dim} numberOfLines={1}>
                      {`${VEHICLE_TIERS.find((t) => t.value === draftCar.vehicleType)?.label} · new`}
                    </T>
                  </Pressable>
                ) : null}
                {vehicles.map((v) => {
                  const on = selectedVehicle === v.id;
                  return (
                    <Pressable
                      key={v.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setPickedVehicle(v.id)}
                      style={[styles.carCell, on ? styles.choiceOn : styles.choiceOff]}
                    >
                      <View style={styles.carTop}>
                        <T size={15} lh={20} numberOfLines={1} style={styles.shrink}>
                          {`${v.make} ${v.model}`}
                        </T>
                        {on ? <IconCheck size={15} stroke={2} color={colors.textPrimary} /> : null}
                      </View>
                      <T num size={13} lh={18} color={colors.dim} numberOfLines={1}>
                        {v.plate}
                      </T>
                    </Pressable>
                  );
                })}
                <Pressable accessibilityRole="button" onPress={() => setAddCarOpen(true)} style={[styles.carCell, styles.dashed]}>
                  <IconPlus size={15} color={colors.textSecondary} />
                  <T size={13} lh={18} color={colors.textSecondary}>
                    Add another car
                  </T>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}

        {usesAddress && !requestMode ? (
          <View {...mark('address')}>
            <T size={17} weight={500} lh={24} tracking={-0.01} style={styles.heading}>
              {isPickup ? 'Where should we collect your car?' : 'Where should we come?'}
            </T>
            {isPickup && addressOptions.length > 0 ? (
              <T size={13} lh={18} color={colors.textSecondary} style={styles.addressNote}>
                The garage brings your car back to the same address.
              </T>
            ) : null}
            {addressOptions.length === 0 ? (
              <View style={styles.warnCard}>
                <T size={15} lh={22}>
                  Add an address to continue
                </T>
                <T size={13} lh={18} color={colors.textSecondary}>
                  {isPickup ? 'Pickup & drop needs the address your car is collected from.' : 'Doorstep service needs somewhere to go.'}
                </T>
                <View style={styles.mt4}>
                  <ScButton variant="outline" fullWidth={false} height={44} paddingX={16} onPress={() => setAddAddressOpen(true)}>
                    <IconPlus size={16} color={colors.textPrimary} />
                    <Label>Add an address</Label>
                  </ScButton>
                </View>
              </View>
            ) : (
              <View style={styles.addressList}>
                {addressOptions.map((a) => (
                  <Pressable
                    key={a.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedAddress === a.id }}
                    onPress={() => pickAddress(a.id)}
                    style={[styles.addressRow, selectedAddress === a.id ? styles.choiceOn : styles.choiceOff]}
                  >
                    <View style={styles.pinDisc}>
                      <IconMapPin size={18} stroke={1.5} color={colors.textPrimary} />
                    </View>
                    <View style={styles.grow}>
                      <T size={15} lh={20}>
                        {a.label}
                        {a.id === DRAFT_ADDRESS && !isGuest ? <T size={15} lh={20} color={colors.textMuted}> · new</T> : null}
                      </T>
                      <T size={13} lh={18} color={colors.textSecondary} numberOfLines={1}>
                        {a.address}
                      </T>
                      {outsidePickup(a) ? (
                        <T size={13} lh={18} color={colors.error} style={styles.mt2}>
                          {"Outside this garage's pickup area"}
                        </T>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
                {addressOutside ? (
                  <View style={styles.warnCardSm}>
                    <T size={15} lh={22}>
                      {"This garage doesn't pick up from this address"}
                    </T>
                    <T size={13} lh={18} color={colors.textSecondary}>
                      {`Try another address${otherMode ? `, or book ${BOOKED_AS[otherMode]} instead` : ''}.`}
                    </T>
                    {otherMode ? (
                      <View style={styles.mt4}>
                        <ScButton variant="outline" fullWidth={false} height={44} paddingX={16} onPress={() => setChosenType(otherMode)}>
                          {`Choose ${BOOKING_TYPE_LABELS[otherMode]}`}
                        </ScButton>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {addressNeedsPin ? (
                  <View style={styles.warnCardSm}>
                    <T size={15} lh={22}>
                      Pin the exact spot
                    </T>
                    <T size={13} lh={18} color={colors.textSecondary}>
                      {`${isPickup ? 'We need it to check this garage collects from you, and so the driver finds your car.' : 'We need it to check this garage travels to you.'}${pinningAddress ? ' Saving...' : ''}`}
                    </T>
                    <LocationPicker showSearch onChange={(picked) => void handlePinAddress(picked)} />
                  </View>
                ) : null}
                <Pressable accessibilityRole="button" onPress={() => setAddAddressOpen(true)} style={[styles.addRow, styles.dashed]}>
                  {!isGuest ? <IconPlus size={15} color={colors.textSecondary} /> : null}
                  <T size={13} lh={18} color={colors.textSecondary}>
                    {isGuest ? 'Change address' : 'Add another address'}
                  </T>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}

        {selectedServices.length > 0 && (savedVehicleId || creditOffered) && !unpricedForVehicle ? (
          <View>
            <T size={17} weight={500} lh={24} tracking={-0.01} style={styles.heading}>
              Savings
            </T>
            <HubCard style={styles.savings}>
              {savedVehicleId ? (
                appliedDiscount ? (
                  <View style={styles.savingRow}>
                    <View style={styles.grow}>
                      <T size={15} lh={22}>
                        {suggestionApplied && appliedReward
                          ? `Best for you: ${appliedReward.label}`
                          : appliedReward
                            ? `${appliedReward.label} applied`
                            : appliedCoupon
                              ? `Coupon applied: ${appliedCoupon.title}`
                              : freeWashes.some((w) => w.code.toUpperCase() === appliedDiscount.code.toUpperCase())
                                ? 'Free wash applied'
                                : `${appliedDiscount.code} applied`}
                      </T>
                      <T size={13} lh={18} color={colors.success}>
                        <Figures size={13} text={`Saves ${money(appliedDiscount.discountAmount)}${suggestionApplied ? ' · applied' : ''}`} />
                      </T>
                    </View>
                    <Pressable accessibilityRole="button" onPress={handleRemovePromo} style={styles.removePromo}>
                      <T size={15} lh={20}>
                        Remove
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
                          Coupons and offers
                        </T>
                      </View>
                      <View style={styles.promoRight}>
                        <T size={13} lh={18}>
                          {offerChecking ? `Checking ${offerCode}…` : 'Apply'}
                        </T>
                        <IconChevronRight size={15} color={colors.textPrimary} />
                      </View>
                    </Pressable>
                    {offerProblem ? (
                      <View style={styles.offerProblem}>
                        <View style={styles.problemLine}>
                          <IconAlertCircle size={15} color={colors.error} />
                          <T size={13} lh={18} color={colors.error} style={styles.grow}>
                            {`${offerCode} doesn't apply to this booking. ${offerProblem}`}
                          </T>
                        </View>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${offerCode}`} onPress={handleRemovePromo} style={styles.removePromo}>
                          <T size={13} lh={18}>
                            Remove
                          </T>
                        </Pressable>
                      </View>
                    ) : null}
                    {rewardVouchers.length > 0 || myCoupons.length > 0 || freeWashes.length > 0 ? (
                      <View style={styles.pills}>
                        {freeWashes.map((wash) => (
                          <Pressable key={wash.code} accessibilityRole="button" disabled={applyPromo.isPending} onPress={() => handleApplyReward(wash.code)} style={[styles.pill, applyPromo.isPending && styles.dim]}>
                            <T size={13} lh={18}>
                              {`Free wash · up to ₹${wash.amount}`}
                            </T>
                          </Pressable>
                        ))}
                        {rewardVouchers.slice(0, 4).map((voucher) => (
                          <Pressable key={voucher.id} accessibilityRole="button" disabled={applyPromo.isPending} onPress={() => handleApplyReward(voucher.code!)} style={[styles.pill, applyPromo.isPending && styles.dim]}>
                            <T size={13} lh={18}>
                              <T num size={13} lh={18}>{`${rewardRupees(voucher.amount)} off`}</T>
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
                    <Figures size={15} text={`Use ${money(creditSplit.credit)} Detlio credit`} />
                  </T>
                  <ScSwitch label="Use Detlio credit" checked={creditSwitchOn} disabled={loading} onChange={setCreditSwitchOn} />
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
                    Subtotal
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
                      Pickup & drop
                    </T>
                    {selectedAddressRecord ? (
                      <T size={13} lh={18} color={colors.textMuted} numberOfLines={1}>
                        {`From and back to ${selectedAddressRecord.address}`}
                      </T>
                    ) : null}
                  </View>
                  <T size={15} lh={22} color={colors.success}>
                    {pickupFeeLabel(0)}
                  </T>
                </View>
              ) : null}
              {travelFee > 0 ? (
                <View style={styles.priceRow}>
                  <T size={15} lh={22} color={colors.textSecondary}>
                    Travel fee
                  </T>
                  <T num size={15} lh={22}>
                    {money(travelFee)}
                  </T>
                </View>
              ) : null}
              {appliedDiscount ? (
                <View style={styles.priceRow}>
                  <T size={15} lh={22} color={colors.textSecondary} numberOfLines={1} style={styles.shrink}>
                    {`Discount (${appliedDiscount.code})`}
                  </T>
                  <T num size={15} lh={22} color={colors.success}>
                    {`−${money(appliedDiscount.discountAmount)}`}
                  </T>
                </View>
              ) : null}
              {creditApplied ? (
                <View style={styles.priceRow}>
                  <T size={15} lh={22} color={colors.textSecondary}>
                    Detlio credit
                  </T>
                  <T num size={15} lh={22} color={colors.success}>
                    {`−${money(creditSplit.credit)}`}
                  </T>
                </View>
              ) : null}
              <View style={[styles.priceRow, (lineCount > 1 || isPickup || travelFee > 0 || appliedDiscount || creditApplied) && styles.totalLine]}>
                <T size={17} lh={24}>
                  To pay
                </T>
                <T num size={20} lh={28}>
                  {toPay == null || !selectedVehicle ? '—' : money(toPay)}
                </T>
              </View>
            </HubCard>
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
                You pay the inspection fee now. If the work costs more, the garage sends the final bill in the app and you pay the rest here.
              </T>
            ) : null}
            <T size={12} lh={18} color={colors.textMuted}>
              <T size={12} lh={18} color={colors.textSecondary}>
                {'Cancellation policy: '}
              </T>
              {`Cancel any time until the garage accepts. Once it has, cancel or reschedule up to 2 hours before your slot. You can reschedule up to 2 times; each new time goes back to the garage to accept, and if it can't take it, the booking is cancelled. If you don't turn up for an accepted booking, it isn't refunded.${isPickup ? ' Once the garage has collected your car, the booking can’t be cancelled or moved in the app.' : ''}`}
            </T>
            {selectedVehicle && !savedVehicleId ? (
              <T size={13} lh={20} color={colors.textSecondary}>
                {offerCode ? `Code ${offerCode} is checked when you pay.` : 'Have a coupon? You can apply it once you’re signed in.'}
              </T>
            ) : null}
          </View>
        ) : null}

        {isGuest && (signInOpen || nextStep === 'signin') ? (
          <View {...mark('signin')}>
            <CheckoutSignInCard
              signIn={signIn}
              busy={busy}
              onVerify={() => void handleVerify()}
              verifyLabel={
                nextStep === 'signin' && signIn.isNew && toPay != null && toPay > 0
                  ? `Verify and pay ${money(toPay)}`
                  : nextStep === 'signin'
                    ? 'Verify and continue'
                    : 'Verify'
              }
            />
          </View>
        ) : null}

        {!isGuest && (needsName || signedInHere) ? (
          <View {...mark('signin')}>
            <HubCard style={styles.signedIn}>
              <T size={17} weight={500} lh={24} tracking={-0.01}>
                {needsName ? 'Your name' : authUser?.name && authUser.name !== 'User' ? `Signed in as ${authUser.name}` : 'Signed in'}
              </T>
              {needsName ? (
                <ScInput
                  label="Your name (for the garage)"
                  placeholder="Your name"
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
                    {"We'll save the car you entered. Or use a saved one:"}
                  </T>
                  <View style={styles.pillsFlat}>
                    {vehicles.map((v) => (
                      <Pressable key={v.id} accessibilityRole="button" onPress={() => setPickedVehicle(v.id)} style={styles.pill}>
                        <T size={13} lh={18}>
                          {`Use saved: ${v.make} ${v.model}`}
                        </T>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              {selectedAddress === DRAFT_ADDRESS && addresses.length > 0 ? (
                <View style={styles.useSaved}>
                  <T size={13} lh={18} color={colors.textSecondary}>
                    {"We'll save the address you entered. Or use a saved one:"}
                  </T>
                  <View style={styles.pillsFlat}>
                    {addresses.map((a) => (
                      <Pressable key={a.id} accessibilityRole="button" onPress={() => pickAddress(a.id)} style={styles.pill}>
                        <T size={13} lh={18}>
                          {`Use saved: ${a.label}`}
                        </T>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              {!needsName && selectedVehicle !== DRAFT_CAR && selectedAddress !== DRAFT_ADDRESS ? (
                <T size={13} lh={18} color={colors.textSecondary}>
                  {"You're signed in. Pay below to send your booking to the garage."}
                </T>
              ) : null}
            </HubCard>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        {paid && paid.phase !== 'confirming' ? (
          <PaymentReceivedPanel paymentId={paid.paymentId} refundMessage={paid.phase === 'failed' ? paid.refundMessage : undefined} />
        ) : paid ? (
          <ScButton variant="quiet" height={52} disabled>
            <Spinner size={16} />
            <Label>Payment received — confirming your booking…</Label>
          </ScButton>
        ) : (
          <>
            {selectedServices.length > 0 ? (
              <View style={styles.barTop}>
                <T size={13} lh={18} color={colors.dim} numberOfLines={1} style={styles.shrink}>
                  {`${bookingSummary}${selectedCar ? ` · ${selectedCar.model}` : ''}`}
                </T>
                {subtotal != null && selectedVehicle ? (
                  <T size={13} lh={20} color={colors.dim}>
                    {`${toPay != null && toPay !== subtotal ? 'To pay' : 'Total'} `}
                    <T num size={15} lh={20}>
                      {money(toPay ?? subtotal)}
                    </T>
                  </T>
                ) : null}
              </View>
            ) : null}
            {!nextStep ? (
              <View style={styles.promises}>
                {guaranteeApplies ? (
                  <View style={styles.promise} accessibilityLabel={GUARANTEE_BADGE}>
                    <IconShieldCheck size={15} stroke={1.5} color={colors.textPrimary} />
                    <T size={13} lh={18} color={colors.textSecondary}>
                      {"Free redo within 48 hours if you're not happy"}
                    </T>
                  </View>
                ) : null}
                <View style={styles.promise}>
                  <IconRefresh size={15} stroke={1.5} color={colors.textPrimary} />
                  <T size={13} lh={18} color={colors.textSecondary}>
                    Free cancel until the garage accepts
                  </T>
                </View>
              </View>
            ) : null}
            {vendor?.outsideServiceCity ? (
              <View style={styles.outsideLine}>
                <OutsideCityLine text={outsideCityCheckoutLine(vendor.outsideServiceCity)} />
              </View>
            ) : null}
            {nextStep ? (
              <ScButton variant="quiet" height={52} backgroundColor={colors.surfaceElevated} disabled={busy} onPress={() => goToStep(nextStep)}>
                {payLabel}
              </ScButton>
            ) : (
              <ScButton variant="hero" height={52} disabled={busy} onPress={() => void handlePay()}>
                <Label color={colors.white}>
                  <Figures color={colors.white} size={15} text={payLabel} weight={600} />
                </Label>
                {!loading ? <IconArrowUpRight size={17} stroke={1.5} color={colors.white} /> : null}
              </ScButton>
            )}
            {hint ? (
              <T size={12} lh={16} color={colors.textMuted} align="center" style={styles.mt8}>
                {hint}
              </T>
            ) : (
              <View style={styles.secure}>
                <IconLock size={12} color={colors.textMuted} />
                <T size={12} lh={16} color={colors.textMuted}>
                  Secure payment by Razorpay · UPI, cards, net banking. Your booking is confirmed once the garage accepts it.
                </T>
              </View>
            )}
          </>
        )}
      </View>

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

      <ScSheet horizontalPadding={16} open={promoOpen} onClose={() => setPromoOpen(false)} dismissible={!applyPromo.isPending} accessibilityLabel="Coupons and offers">
        <T size={20} lh={28} tracking={-0.015}>
          Coupons and offers
        </T>
        <View style={styles.promoBox}>
          <TextInput
            accessibilityLabel="Coupon code"
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect={false}
            placeholder="Enter coupon code"
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={colors.keyboard}
            value={promoInput}
            onChangeText={(text) => setPromoInput(text.toUpperCase())}
            onSubmitEditing={handleApplyPromo}
            style={styles.promoInput}
          />
          <Pressable accessibilityRole="button" disabled={!canApplyPromo || applyPromo.isPending} onPress={handleApplyPromo} style={styles.promoApply}>
            <T size={15} weight={500} lh={20} color={canApplyPromo && !applyPromo.isPending ? colors.textPrimary : colors.textMuted}>
              {applyPromo.isPending ? 'Checking…' : 'Apply'}
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
          Have a code from Detlio? Enter it above to see your savings before you pay.
        </T>
      </ScSheet>

      <ScSheet horizontalPadding={16} open={unsettled} onClose={() => setUnsettled(false)} accessibilityLabel="Your last payment">
        <T size={20} lh={28} tracking={-0.015}>
          Your last payment isn&apos;t settled yet
        </T>
        <T size={15} lh={22} color={colors.textSecondary} style={styles.mt8}>
          If you finished paying, it shows up here in a minute, so there&apos;s no need to pay again. If you closed the payment without paying, you can start over.
        </T>
        <View style={styles.unsettled}>
          <ScButton variant="main" onPress={() => setUnsettled(false)}>
            Wait a minute
          </ScButton>
          <ScButton
            variant="outline"
            onPress={() => {
              pendingPayment.clear();
              setUnsettled(false);
            }}
          >
            I didn&apos;t pay. Start over
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
  carCell: { width: '48.8%', minHeight: 64, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center' },
  carTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  choiceOn: { borderColor: c.textPrimary, backgroundColor: c.fillChosen },
  choiceOff: { borderColor: c.line, backgroundColor: c.fillFaint },
  dashed: { borderWidth: 1, borderStyle: 'dashed', borderColor: c.stroke, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  addressNote: { marginTop: -4, marginBottom: 12 },
  addressList: { gap: 8 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
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
  bar: { borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.canvas, paddingHorizontal: 16, paddingTop: 12 },
  barTop: { marginBottom: 10, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  promises: { marginBottom: 10, alignItems: 'center', gap: 4 },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  outsideLine: { marginBottom: 8, alignItems: 'center' },
  secure: { marginTop: 8, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 4 },
  promoBox: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.fillSoft, paddingHorizontal: 12 },
  promoInput: { flex: 1, minWidth: 0, paddingVertical: 14, fontSize: 15, color: c.textPrimary },
  promoApply: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, marginRight: -4 },
  promoNote: { marginTop: 16 },
  unsettled: { marginTop: 20, gap: 8 },
}));
