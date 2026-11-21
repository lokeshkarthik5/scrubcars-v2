import { useSavedGarages, useToggleSavedGarage } from '@repo/core/api/hooks/use-favourites';
import { useVendorClosures, useVendorWorkingHours } from '@repo/core/api/hooks/use-slots';
import { toMinutes, useTravelTime } from '@repo/core/api/hooks/use-travel-time';
import { useGarage, useVendorReviews } from '@repo/core/api/hooks/use-vendors';
import { bookingTypeParam, offeredBookingTypes, parseBookingType, resolveBookingType } from '@repo/core/booking-types';
import { distanceAndDrive, distanceLabel } from '@repo/core/drive-time';
import { straightLineKm } from '@repo/core/map';
import { isNoFeeInspection, resolveServiceAmount } from '@repo/core/pricing';
import { hasStarScore, NEW_GARAGE_LABEL } from '@repo/core/ratings';
import { knownDurationTotal } from '@repo/core/service-duration';
import { anywhereInCityLine } from '@repo/core/reach';
import { useUserStore } from '@repo/core/stores/user-store';
import type { BookingType, Service, ServicePackage, Vendor } from '@repo/core/types';
import { formatDuration } from '@repo/core/utils';
import { Glass, Odometer, Raised, Recessed, RedButton } from '@repo/native-ui/finish';
import { IconArrowLeft, IconArrowUpRight, IconMapPin, IconSearch, IconStarFilled } from '@repo/native-ui/icons';
import { EASE_SETTLE, PressScale, Rise, SeenProvider, useReduceMotion, useSeenHost } from '@repo/native-ui/motion';
import { ErrorState, Notice, SkeletonList } from '@repo/native-ui/primitives';
import { Figures, font, T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NextFreeRow } from '@/components/garage/next-free-row';
import { FlyHost, useFlyTarget } from '@/components/garage/red-light-add';
import { GarageRoad } from '@/components/moments/road';
import { GaragePickupAsk, GaragePickupLine } from '@/components/garage/garage-pickup-fee';
import { OpenMotion } from '@/components/open-motion';

import { GarageCover, GarageMonogram } from '@/components/garage/cover';
import { ModeSwitch } from '@/components/garage/mode-switch';
import { OpenStatus } from '@/components/garage/open-status';
import { ReviewsTab } from '@/components/garage/reviews-tab';
import { GarageSlotAlerts } from '@/components/slot-alerts/garage-slot-alerts';
import { SaveGarageButton } from '@/components/garage/save-button';
import { GarageAddOns, PackageCard, ServiceCard, ServiceSheet } from '@/components/garage/service-cards';
import { OutsideCityLine, TierSeal } from '@/components/garage/tier';
import { useGarageTownLine } from '@/lib/customer-place';
import { useAuth } from '@/lib/auth';
import { browseCategory } from '@repo/core/analytics-events';
import { fill, msg, useT, useTn } from '@repo/core/i18n';
import { track } from '@/lib/shims/analytics';
import { useBookingCar } from '@/lib/booking-car';
import { coarse, isApproximate, isCitywide, useLocationStore } from '@/lib/location';
import { money, pricedForCar, servicePriceText } from '@/lib/price';
import type { AddOn } from '@repo/core/api/types';

type Tab = 'services' | 'photos' | 'reviews';
const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'services', label: msg('Services') },
  { key: 'photos', label: msg('Photos') },
  { key: 'reviews', label: msg('Reviews') },
];
const NO_SERVICES: Service[] = [];
const NO_PACKAGES: ServicePackage[] = [];
const NO_ADD_ONS: AddOn[] = [];

/** apps/users/app/garage/[id]/page.tsx. */
export default function GarageScreen() {
  const tn = useTn();
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id: string; mode?: string; withdrawn?: string; code?: string; save?: string }>();
  const id = params.id;
  const offerCode = params.code?.trim() || null;
  const user = useAuth((s) => s.user);
  const activeLocation = useLocationStore((s) => s.location);

  useEffect(() => {
    if (user) void useUserStore.getState().fetchVehicles().catch(() => undefined);
  }, [user]);
  const { car: myCar } = useBookingCar();
  const carType = myCar?.vehicleType ?? null;

  const garage = useGarage(id);
  const vendor = garage.data?.vendor ?? null;
  // Where the garage is, said only when it is not in the customer's city (0070).
  const townLine = useGarageTownLine(vendor);
  const services = garage.data?.services ?? NO_SERVICES;
  const packages = garage.data?.packages ?? NO_PACKAGES;
  const [tab, setTab] = useState<Tab>('services');
  // Reviews load when their tab opens (speed fix 8): the count is already on the garage.
  const reviewsList = useVendorReviews(id, { enabled: tab === 'reviews' }).data ?? [];
  // Already in the garage's own read (garageQuery): a second request for the same list cost a round trip.
  const addOns = garage.data?.addOns ?? NO_ADD_ONS;
  const workingHours = useVendorWorkingHours(id);
  const closures = useVendorClosures(id);
  const travel = useTravelTime(
    activeLocation?.source === 'gps' ? coarse(activeLocation) : null,
    vendor ? { lat: vendor.lat, lng: vendor.lng } : null
  );

  const [chosenMode, setChosenMode] = useState<BookingType | null>(() => parseBookingType(params.mode));
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<Service | ServicePackage | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Back from signing in to save this garage: save it, once, and take the flag out.
  const savedGarages = useSavedGarages({ enabled: !!user });
  const toggleSaved = useToggleSavedGarage();
  const saveHandled = useRef(false);
  useEffect(() => {
    if (params.save !== '1' || saveHandled.current || !user || !vendor || !savedGarages.data) return;
    saveHandled.current = true;
    if (!savedGarages.data.vendors.some((v) => v.id === vendor.id)) toggleSaved.mutate({ vendor, save: true });
    router.setParams({ save: undefined });
  }, [params.save, user, vendor, savedGarages.data, toggleSaved]);

  const matches = (s: { name: string; description?: string | null }, q: string) =>
    s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? services.filter((s) => matches(s, q)) : services;
  }, [services, query]);
  const filteredPackages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? packages.filter((p) => matches(p, q) || p.items.some((i) => i.name.toLowerCase().includes(q))) : packages;
  }, [packages, query]);
  const selectedServices = useMemo(() => {
    const catalogue = [...services, ...packages];
    return selected.map((sid) => catalogue.find((s) => s.id === sid)).filter((s): s is Service | ServicePackage => s != null);
  }, [selected, services, packages]);

  const seenGarage = useRef(false);
  useEffect(() => {
    if (!vendor || seenGarage.current) return;
    seenGarage.current = true;
    track('garage_view', { vendorId: vendor.id, mode: parseBookingType(params.mode ?? null) ?? 'dropin' });
  }, [vendor, params.mode]);
  const toggle = (sid: string) => {
    if (!selected.includes(sid)) {
      const item = [...(garage.data?.services ?? []), ...(garage.data?.packages ?? [])].find((s) => s.id === sid);
      track('service_add', { vendorId: id, category: browseCategory(item?.category) });
    }
    setSelected((list) => (list.includes(sid) ? list.filter((x) => x !== sid) : [...list, sid]));
  };
  const open = (item: Service | ServicePackage) => {
    setDetails(item);
    setDetailsOpen(true);
    track('service_sheet_open', { vendorId: id, category: browseCategory(item.category) });
  };

  const mode = resolveBookingType(chosenMode, vendor);
  const { fx } = useFinish();
  const scrollY = useRef(new Animated.Value(0)).current;
  const seen = useSeenHost();
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
    listener: () => seen.notify(),
  });
  // Past the hero, the glass top bar with the name takes over.
  const solid = scrollY.interpolate({ inputRange: [HERO_HEIGHT - 140, HERO_HEIGHT - 90], outputRange: [0, 1], extrapolate: 'clamp' });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/garages' as Href));

  if (!vendor) {
    return (
      <View style={[styles.state, { paddingTop: insets.top }]}>
        {garage.isError && !garage.isFetching ? (
          <ErrorState message={t("Couldn't load this garage. Check your connection.")} onRetry={() => void garage.refetch()} />
        ) : garage.data === null ? (
          <>
            <T size={13} color={colors.textSecondary} align="center">
              {t("This garage isn't taking bookings on Detlio.")}
            </T>
            <Pressable accessibilityRole="link" onPress={() => router.replace('/garages' as Href)} style={styles.findAnother}>
              <T size={13} weight={600} style={styles.underline}>
                {t('Find another garage')}
              </T>
            </Pressable>
          </>
        ) : (
          <T size={13} color={colors.textSecondary}>
            {t('Loading…')}
          </T>
        )}
      </View>
    );
  }

  const selectedTotal = selectedServices.reduce((total, s) => total + (resolveServiceAmount(s, carType ?? undefined) ?? s.price), 0);
  const selectedDuration = knownDurationTotal(selectedServices);
  const hasPerVehiclePricing = selectedServices.some((s) => s.pricingType === 'per_vehicle' && !pricedForCar(s, carType));
  const reviewCount = vendor.reviewCount || reviewsList.length;
  const showStars = hasStarScore({ reviewCount, isNew: vendor.isNew });
  const visibleTabs = TABS.filter((item) => item.key !== 'reviews' || reviewCount > 0);
  const hero = vendor.photos[0] ?? null;
  const fromHere =
    activeLocation && !isCitywide(activeLocation) && vendor.lat != null && vendor.lng != null
      ? straightLineKm(coarse(activeLocation), { lat: vendor.lat, lng: vendor.lng })
      : null;
  const approximate = isApproximate(activeLocation);
  const modes = offeredBookingTypes(vendor);
  const anywhere = anywhereInCityLine(vendor, mode);
  const paused = vendor.bookingsPaused;
  const showBar = paused || selectedServices.length > 0;

  const book = () => {
    if (selected.length === 0) return;
    track('booking_start', { vendorId: id, mode, serviceCount: Math.min(20, selected.length) });
    const modeQuery = bookingTypeParam(mode);
    router.push(
      `/book/${id}?service=${selected.join(',')}${modeQuery ? `&mode=${modeQuery}` : ''}${offerCode ? `&code=${encodeURIComponent(offerCode)}` : ''}` as Href
    );
  };

  const barTotal =
    selectedServices.length === 1
      ? servicePriceText(selectedServices[0], carType)
      : // Only no-fee inspections (0073): nothing is priced yet, never "₹0".
        selectedTotal === 0 && selectedServices.some(isNoFeeInspection)
        ? t('Price on inspection')
        : hasPerVehiclePricing ? t('from {amount}', { amount: money(selectedTotal) }) : money(selectedTotal);

  // The scroll's direct children, so the tabs can stick: [hero, body, tabs, pane].
  return (
    <FlyHost>
      <SeenProvider value={seen.value}>
      <View style={styles.page}>
        <OpenMotion style={styles.fill}>
          <Animated.ScrollView
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            stickyHeaderIndices={[2]}
            scrollEventThrottle={16}
            onScroll={onScroll}
            contentContainerStyle={{ paddingBottom: showBar ? 120 : insets.bottom + 24 }}
          >
            <GarageHero vendor={vendor} scrollY={scrollY} />

            <View style={styles.body}>
              <Rise index={0} delay={160}>
                <View style={styles.titleRow}>
                  {vendor.logoUrl ? (
                    <View style={styles.logo}>
                      <Image source={{ uri: vendor.logoUrl }} accessibilityLabel={t('{name} logo', { name: vendor.name })} resizeMode="cover" style={styles.fill} />
                    </View>
                  ) : (
                    <GarageMonogram vendor={vendor} size={56} radius={16} fontSize={17} />
                  )}
                  <View style={styles.flex}>
                    <T accessibilityRole="header" variant="title">
                      {vendor.name}
                    </T>
                    <View style={styles.openLine}>
                      <OpenStatus variant="ring" hours={workingHours.data} closures={closures.data} />
                    </View>
                  </View>
                </View>

                {/* Score, distance and drive time are figures; the words between them stay Inter. */}
                <View style={styles.facts}>
                  {showStars ? (
                    <View style={styles.fact}>
                      <IconStarFilled size={13} color={colors.warningFill} />
                      <T num variant="t4" weight={600}>
                        {vendor.rating.toFixed(1)}
                      </T>
                      <T variant="t4" color={fx.quiet}>
                        ({tn(reviewCount, '{count} review', '{count} reviews')})
                      </T>
                    </View>
                  ) : (
                    <T variant="t4" weight={600}>
                      {t(NEW_GARAGE_LABEL)}
                    </T>
                  )}
                  {fromHere !== null ? (
                    <View style={styles.fact}>
                      <T num variant="t4" weight={600}>
                        {travel.data ? distanceLabel(fromHere, approximate) : distanceAndDrive(fromHere, approximate)}
                      </T>
                      {/* A GPS customer's real road time, when routing answers, in place of the estimate. */}
                      {travel.data ? (
                        <T variant="t4" color={fx.quiet}>
                          {'· '}
                          {fill(t('{time} drive'), {
                            time: (
                              <T num variant="t4" weight={600} color={colors.textPrimary}>
                                {formatDuration(toMinutes(travel.data.durationS))}
                              </T>
                            ),
                          })}
                        </T>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                <View style={styles.chips}>
                  {vendor.area ? (
                    <Raised radius={12} style={styles.areaChip} innerStyle={styles.areaInner}>
                      <IconMapPin size={14} color={fx.quietBright} />
                      <T variant="t4" color={fx.soft}>
                        {vendor.area}
                      </T>
                    </Raised>
                  ) : null}
                  {vendor.tier ? <TierSeal tier={vendor.tier} /> : null}
                </View>
                {townLine ? (
                  <View style={styles.outside}>
                    <OutsideCityLine text={townLine} />
                  </View>
                ) : null}
                {/* You → the garage, while the page knows where you are. */}
                {fromHere !== null ? <GarageRoad to={vendor.name} style={styles.road} /> : null}
              </Rise>

              {modes.length > 1 ? (
                <Rise index={1} delay={160} style={styles.section}>
                  <ModeSwitch modes={modes} value={mode} onChange={setChosenMode} />
                </Rise>
              ) : null}
              {anywhere ? (
                <T variant="t5" lh={18} color={fx.quiet} style={styles.pickupNote}>
                  {anywhere}
                </T>
              ) : null}
              {/* The pickup fee for the customer's address (0079), or Free as before. */}
              {mode === 'pickup' ? <GaragePickupLine vendor={vendor} /> : null}
              {/* Ask for pickup (0079): a garage that doesn't collect, or whose area stops short. */}
              <GaragePickupAsk vendor={vendor} mode={mode} />
              {params.withdrawn === '1' ? (
                <View style={styles.notice}>
                  <Notice tone="neutral" title={t('The services you picked are no longer offered here.')}>
                    {t('Choose from what this garage offers now.')}
                  </Notice>
                </View>
              ) : null}
              <View style={styles.alerts}>
                <GarageSlotAlerts vendorId={vendor.id} />
              </View>
              {/* The next free times, for the mode on the switch; a time opens the booking on it. */}
              {!paused ? (
                <Rise index={2} delay={160} style={styles.section}>
                  <NextFreeRow vendor={vendor} mode={mode} visible serviceIds={selected} style={styles.nextFree} />
                </Rise>
              ) : null}
            </View>

            <GarageTabs tabs={visibleTabs} tab={tab} onTab={setTab} reviewCount={reviewCount} scrollY={scrollY} />

            <Rise key={tab} style={styles.panel}>
              {tab === 'services' ? (
                <>
                  <Recessed radius={16} style={styles.search} innerStyle={styles.searchInner}>
                    <IconSearch size={17} color={fx.quiet} />
                    <TextInput
                      accessibilityLabel={t('Search services')}
                      placeholder={t('Search services...')}
                      placeholderTextColor={fx.quiet}
                      keyboardAppearance={colors.keyboard}
                      value={query}
                      onChangeText={setQuery}
                      style={styles.searchInput}
                    />
                  </Recessed>
                  {filteredPackages.length > 0 ? (
                    <View style={styles.group}>
                      <PaneHeading title={t('Packages')} count={tn(filteredPackages.length, '{count} package', '{count} packages')} />
                      {filteredPackages.map((pkg, i) => (
                        <Rise key={pkg.id} index={i}>
                          <PackageCard
                            pkg={pkg}
                            added={selected.includes(pkg.id)}
                            paused={paused}
                            carType={carType}
                            onOpen={() => open(pkg)}
                            onToggle={() => toggle(pkg.id)}
                          />
                        </Rise>
                      ))}
                    </View>
                  ) : null}
                  <View style={styles.group}>
                    <PaneHeading title={t('Services')} count={tn(filtered.length, '{count} service', '{count} services')} />
                    {garage.isPlaceholderData ? (
                      <SkeletonList count={3} height={96} />
                    ) : filtered.length === 0 ? (
                      <T variant="t4" weight={400} color={colors.textSecondary} align="center" style={styles.none}>
                        {services.length === 0 ? t('No services available yet.') : t('No services match that search.')}
                      </T>
                    ) : (
                      filtered.map((svc, i) => (
                        <Rise key={svc.id} index={i}>
                          <ServiceCard
                            service={svc}
                            added={selected.includes(svc.id)}
                            paused={paused}
                            carType={carType}
                            carModel={myCar?.model ?? null}
                            onOpen={() => open(svc)}
                            onToggle={() => toggle(svc.id)}
                          />
                        </Rise>
                      ))
                    )}
                  </View>
                  {addOns.length > 0 ? <GarageAddOns addOns={addOns} carType={carType} /> : null}
                </>
              ) : null}

              {tab === 'photos' ? (
                vendor.photos.length > 0 ? (
                  <View style={styles.grid}>
                    {vendor.photos.map((url, i) => (
                      <Rise key={url} index={i}>
                        <Image
                          source={{ uri: url }}
                          accessibilityLabel={`${vendor.name} ${i + 1}`}
                          resizeMode="cover"
                          style={[styles.gridPhoto, { width: (width - 40) / 2, height: (width - 40) / 2 }]}
                        />
                      </Rise>
                    ))}
                  </View>
                ) : (
                  <T variant="t4" weight={400} color={colors.textSecondary} align="center" style={styles.none}>
                    {t('No photos yet.')}
                  </T>
                )
              ) : null}

              {tab === 'reviews' ? <ReviewsTab vendor={vendor} reviewCount={reviewCount} /> : null}
            </Rise>
          </Animated.ScrollView>
        </OpenMotion>

        {/* Back and the heart float on the photo, on glass; past the hero a glass bar with the
            garage's name takes over. The name there is not a heading: the page's one heading is below. */}
        <View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top, height: insets.top + 60 }]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: solid }]}>
            <Glass radius={0} edge={false} base={fx.glassPinned} style={[StyleSheet.absoluteFill, styles.topGlass, { borderBottomColor: fx.glassEdge }]} />
          </Animated.View>
          <View pointerEvents="box-none" style={styles.topRow}>
            <PressScale accessibilityRole="button" accessibilityLabel={t('Go back')} onPress={back}>
              {/* Dark glass in both themes: it sits on the photo first. */}
              <Glass radius={12} base="rgba(18,18,22,0.5)" style={styles.round}>
                <IconArrowLeft size={20} color="#FAFAFA" />
              </Glass>
            </PressScale>
            <Animated.View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.flex, { opacity: solid, transform: [{ translateY: solid.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}
            >
              <T variant="t3" weight={600} numberOfLines={1}>
                {vendor.name}
              </T>
            </Animated.View>
            <SaveGarageButton vendor={vendor} glass />
          </View>
        </View>

        {paused ? (
          <View style={[styles.barWrap, { paddingBottom: insets.bottom + 14 }]}>
            <Glass accessibilityLiveRegion="polite" radius={22} heavy style={styles.pausedBar}>
              <T variant="t3" weight={600}>
                {t('Not taking bookings right now')}
              </T>
              <T variant="t4" weight={400} color={colors.textSecondary} style={styles.pausedLine}>
                {vendor.bookingsPausedReason || t('This garage has paused new bookings. Check back later, or pick another garage.')}
              </T>
            </Glass>
          </View>
        ) : selectedServices.length > 0 ? (
          <BookingBar bottom={insets.bottom + 14}>
            <View style={styles.flex}>
              <T variant="t5" numberOfLines={1} color={fx.quietBright}>
                {selectedServices.length === 1
                  ? selectedServices[0].name
                  : `${t('{count} services', { count: selectedServices.length })}${selectedDuration !== null ? ` · ${formatDuration(selectedDuration)}` : ''}`}
              </T>
              {/* The total rolls like an odometer as services come and go. */}
              {/^[₹\d]/.test(barTotal) ? (
                <Odometer value={barTotal} numeric={selectedTotal} size={20} lh={24} />
              ) : (
                <T size={20} weight={600} lh={24} numberOfLines={1}>
                  <Figures size={20} weight={600} lh={24} text={barTotal} />
                </T>
              )}
            </View>
            {/* The page's one main action, solid red. */}
            <RedButton height={48} radius={15} onPress={book} accessibilityLabel={t('Book now')}>
              <T variant="t3" weight={600} color="#FFFFFF">
                {t('Book now')}
              </T>
              <IconArrowUpRight size={16} line={1.8} color="#FFFFFF" />
            </RedButton>
          </BookingBar>
        ) : null}

        <ServiceSheet
          garageName={vendor?.name ?? ''}
          details={details}
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          added={details ? selected.includes(details.id) : false}
          paused={paused}
          onToggle={() => {
            if (details) toggle(details.id);
            setDetailsOpen(false);
          }}
        />
      </View>
      </SeenProvider>
    </FlyHost>
  );
}

/** A pane's heading: its name and how many, over the cards. */
function PaneHeading({ title, count }: { title: string; count: string }) {
  const styles = useStyles();
  const { fx } = useFinish();
  return (
    <View style={styles.sectionHead}>
      <T variant="t2">{title}</T>
      <T variant="t5" color={fx.quiet}>
        {count}
      </T>
    </View>
  );
}

const HERO_HEIGHT = 340;

/**
 * The garage page's tall hero (§5; apps/users/components/garage/garage-hero.tsx): every
 * photo of the garage, swiped by hand, with dots that stretch, a shade into the page below
 * and a slow drift as the page scrolls. Without a photo, the garage's designed cover.
 */
function GarageHero({ vendor, scrollY }: { vendor: Vendor; scrollY: Animated.Value }) {
  const t = useT();
  const styles = useStyles();
  const reduce = useReduceMotion();
  const { width } = useWindowDimensions();
  const [photo, setPhoto] = useState(0);
  const strip = useRef<ComponentRef<typeof ScrollView>>(null);
  const photos = vendor.photos;
  const drift = reduce ? 0 : scrollY.interpolate({ inputRange: [-200, 0, HERO_HEIGHT], outputRange: [0, 0, HERO_HEIGHT * 0.35], extrapolate: 'clamp' });
  return (
    <View style={styles.hero}>
      {photos.length > 0 ? (
        <ScrollView
          ref={strip}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={photos.length > 1}
          onMomentumScrollEnd={(event) => setPhoto(Math.round(event.nativeEvent.contentOffset.x / width))}
        >
          {photos.map((src, i) => (
            <View key={src} style={[styles.heroSlide, { width }]}>
              <Animated.Image
                source={{ uri: src }}
                accessibilityLabel={i === 0 ? vendor.name : undefined}
                resizeMode="cover"
                style={[styles.heroPhoto, { width, transform: [{ translateY: drift }] }]}
              />
            </View>
          ))}
        </ScrollView>
      ) : (
        <GarageCover vendor={vendor} size="hero" metaTop={72} />
      )}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', styles.page.backgroundColor as string]}
        locations={[0, 0.28, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      {photos.length > 1 ? (
        <View style={styles.heroDots}>
          {photos.map((src, i) => (
            <Pressable
              key={src}
              accessibilityRole="button"
              accessibilityLabel={t('Photo {number} of {total}', { number: i + 1, total: photos.length })}
              accessibilityState={{ selected: i === photo }}
              hitSlop={10}
              onPress={() => {
                setPhoto(i);
                strip.current?.scrollTo({ x: i * width, animated: !reduce });
              }}
              style={styles.dotTouch}
            >
              <View style={[styles.dot, i === photo && styles.dotOn]} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Services / Photos / Reviews (N), with the red light as a line under the open one that
 * flows to the next; sticky on glass once it reaches the top bar.
 */
function GarageTabs({
  tabs,
  tab,
  onTab,
  reviewCount,
  scrollY,
}: {
  tabs: readonly { key: Tab; label: string }[];
  tab: Tab;
  onTab: (tab: Tab) => void;
  reviewCount: number;
  scrollY: Animated.Value;
}) {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const { fx } = useFinish();
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const [places, setPlaces] = useState<Partial<Record<Tab, { x: number; width: number }>>>({});
  const [y, setY] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const w = useRef(new Animated.Value(1)).current;
  const place = places[tab];
  useEffect(() => {
    if (!place) return;
    if (reduce) {
      x.setValue(place.x);
      w.setValue(place.width / 100);
      return;
    }
    Animated.parallel([
      Animated.timing(x, { toValue: place.x, duration: 360, easing: EASE_SETTLE, useNativeDriver: true }),
      Animated.timing(w, { toValue: place.width / 100, duration: 360, easing: EASE_SETTLE, useNativeDriver: true }),
    ]).start();
  }, [place, reduce, x, w]);
  // Glass once stuck under the top bar: the page has scrolled the tabs up to it.
  const top = insets.top + 60;
  const stuck = scrollY.interpolate({ inputRange: [y - top - 1, y - top], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    // The spacer the top bar covers once the tabs stick, overlapping the content above until then.
    <View pointerEvents="box-none" onLayout={(event) => setY(event.nativeEvent.layout.y + top)} style={[styles.tabsWrap, { marginTop: 24 - top }]}>
      <View pointerEvents="none" style={{ height: top }} />
      <View style={[styles.tabs, { borderBottomColor: fx.hairline }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: stuck }]}>
          <Glass radius={0} edge={false} base={fx.glassPinned} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <View accessibilityRole="tablist" accessibilityLabel={t('Garage sections')} style={styles.tabRow}>
          {tabs.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item.key }}
              accessibilityLabel={item.key === 'reviews' ? `${t(item.label)}, ${reviewCount}` : t(item.label)}
              onPress={() => onTab(item.key)}
              onLayout={(event) => {
                const { x: left, width } = event.nativeEvent.layout;
                setPlaces((all) => ({ ...all, [item.key]: { x: left, width } }));
              }}
              style={styles.tab}
            >
              {/* One line: a longer (Tamil) name shrinks to fit rather than push the row off screen. */}
              <T
                size={14}
                weight={600}
                lh={18}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                color={tab === item.key ? colors.textPrimary : fx.quiet}
                style={styles.tabLabel}
              >
                {t(item.label)}
              </T>
              {item.key === 'reviews' ? (
                <T num variant="t5" weight={600} color={fx.quiet}>
                  {reviewCount}
                </T>
              ) : null}
            </Pressable>
          ))}
          {/* The light under the open tab: the red light, as a line. 100 wide, sized by transform only. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tabLine,
              { transform: [{ translateX: x }, { translateX: -50 }, { scaleX: w }, { translateX: 50 }] },
            ]}
          >
            <LinearGradient colors={['#E4002B', '#FF5A70']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

/** The glass booking bar, rising once something is picked; the flying dot lands on it. */
function BookingBar({ bottom, children }: { bottom: number; children: ReactNode }) {
  const styles = useStyles();
  const reduce = useReduceMotion();
  const target = useFlyTarget();
  const rise = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.timing(rise, { toValue: 1, duration: 450, easing: Easing.bezier(0.34, 1.25, 0.64, 1), useNativeDriver: true }).start();
  }, [reduce, rise]);
  return (
    <Animated.View
      style={[
        styles.barWrap,
        { paddingBottom: bottom, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [140, 0] }) }] },
      ]}
    >
      <View ref={target}>
        <Glass radius={22} heavy style={styles.bar}>
          {children}
        </Glass>
      </View>
    </Animated.View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  flex: { flex: 1, minWidth: 0 },
  fill: { flex: 1, width: '100%', height: '100%' },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: c.canvas, padding: 16 },
  findAnother: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  underline: { textDecorationLine: 'underline' },
  hero: { height: HERO_HEIGHT, overflow: 'hidden', backgroundColor: c.scheme === 'light' ? c.surfaceElevated : '#141418' },
  heroSlide: { height: HERO_HEIGHT, overflow: 'hidden' },
  // Taller than the frame, so the drift never shows an edge.
  heroPhoto: { position: 'absolute', top: -24, height: HERO_HEIGHT + 48 },
  heroDots: { position: 'absolute', left: 0, right: 0, bottom: 36, flexDirection: 'row', justifyContent: 'center', gap: 2 },
  dotTouch: { height: 24, paddingHorizontal: 2, justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotOn: { width: 16, backgroundColor: '#FFFFFF' },
  body: { marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: c.canvas, paddingHorizontal: 16, paddingTop: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logo: { width: 56, height: 56, overflow: 'hidden', borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.75)', backgroundColor: c.surface },
  openLine: { marginTop: 5 },
  facts: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 6 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chips: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8 },
  areaChip: { height: 32 },
  areaInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 12 },
  outside: { marginTop: 12 },
  road: { marginTop: 18 },
  section: { paddingTop: 20 },
  pickupNote: { marginTop: 10 },
  notice: { marginTop: 16 },
  alerts: { marginTop: 16 },
  nextFree: { paddingHorizontal: 0, paddingBottom: 0, paddingTop: 0 },
  tabsWrap: { zIndex: 3 },
  tabs: { height: 46, borderBottomWidth: 1, backgroundColor: c.canvas },
  tabRow: { flex: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 12 },
  tab: { minHeight: 44, flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  tabLabel: { flexShrink: 1, minWidth: 0 },
  tabLine: {
    position: 'absolute',
    left: 0,
    bottom: -1,
    width: 100,
    height: 2,
    borderRadius: 2,
    overflow: 'hidden',
    shadowColor: '#FF2D4A',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 5,
    shadowOpacity: 0.8,
  },
  panel: { gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  search: { height: 48 },
  searchInner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 12, fontFamily: font(500), fontSize: 15, color: c.textPrimary },
  group: { paddingTop: 16, gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 },
  none: { paddingVertical: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridPhoto: { borderRadius: 16, backgroundColor: c.surface },
  top: { position: 'absolute', left: 0, right: 0, top: 0 },
  topGlass: { borderBottomWidth: 1 },
  topRow: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 },
  round: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  barWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12 },
  bar: { height: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 18, paddingRight: 10 },
  pausedBar: { paddingHorizontal: 18, paddingVertical: 14 },
  pausedLine: { marginTop: 2 },
}));
